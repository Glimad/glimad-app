import { createAdminClient } from '@/lib/supabase/admin'
import { appendSignal, writeFact, readFact, createSnapshot, readAllFacts } from '@/lib/brain'
import { debitPremiumCredits } from '@/lib/wallet'
import { runPhaseEngine } from '@/lib/engines/phase-engine'
import { scrapeYouTube } from './youtube'
import { scrapeInstagram } from './instagram'
import { scrapeTikTok } from './tiktok'
import { scrapeSpotify } from './spotify'
import { scrapeTwitter } from './twitter'
import { createHash } from 'crypto'

type ScrapeSource = 'bootstrap' | 'cron' | 'on_demand'

// Credit cost per source (bootstrap = free initial scrape after first payment)
const CREDIT_COST: Record<ScrapeSource, number> = {
  bootstrap: 0,
  cron: 5,
  on_demand: 10,
}

// Plan-tier rate limits: max scrapes per 24h window
const RATE_LIMIT: Record<string, number> = {
  BASE: 1,
  PRO: 2,
  ELITE: 4,
}

type AdminClient = ReturnType<typeof createAdminClient>

// Common normalized shape every platform scraper must return
interface ScrapeNormalized {
  followers_total: number
  avg_er_estimated: number
  avg_views: number
  avg_likes: number
  avg_comments: number
  posts_last_7d: number
  posts_last_30d: number
  last_post_date: string | null
  posts_per_week_average: number
  monthly_listeners: number | null
  viral_spike: { post_id: string; multiplier: number } | null
}

// ── Platform dispatcher ────────────────────────────────────────────────────

async function runPlatformScrape(
  platform: string,
  handle: string
): Promise<{ raw: unknown; normalized: ScrapeNormalized }> {
  switch (platform) {
    case 'youtube':
      return scrapeYouTube(handle)
    case 'instagram':
      return scrapeInstagram(handle)
    case 'tiktok':
      return scrapeTikTok(handle)
    case 'spotify':
      return scrapeSpotify(handle)
    case 'twitter':
      return scrapeTwitter(handle)
    default:
      throw new Error(`Platform not supported yet: ${platform}`)
  }
}

// ── Retry helper ──────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  onFailure: (attempt: number, err: Error) => Promise<void>,
  maxAttempts = 3
): Promise<T> {
  let lastErr: Error = new Error('unknown')
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err as Error
      await onFailure(attempt, lastErr)
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1))) // 1s, 2s, 4s
      }
    }
  }
  throw lastErr
}

// ── Job execution ──────────────────────────────────────────────────────────

export async function executeScrapeLightJob(
  admin: AdminClient,
  jobId: string
) {
  // Read current job state before marking as running
  const { data: jobBefore } = await admin
    .from('core_jobs')
    .select('*')
    .eq('job_id', jobId)
    .single()

  if (!jobBefore) throw new Error('Job not found')

  // Increment attempt count correctly (not hardcoded to 1)
  const newAttempts = (jobBefore.attempts ?? 0) + 1

  await admin
    .from('core_jobs')
    .update({ status: 'running', started_at: new Date().toISOString(), attempts: newAttempts })
    .eq('job_id', jobId)

  const { project_id, payload_json } = jobBefore
  const { platform, handle, source = 'cron' } = payload_json as { platform: string; handle: string; source?: ScrapeSource }

  const today = new Date().toISOString().slice(0, 10)
  const scrapeIdempotencyKey = `${platform}:${handle}:${today}`

  // Dedupe: skip execution if already ran today for this handle+platform
  const { data: existingRun } = await admin
    .from('core_scrape_runs')
    .select('run_id')
    .eq('idempotency_key', scrapeIdempotencyKey)
    .single()

  if (!existingRun) {
    const { raw, normalized } = await withRetry(
      () => runPlatformScrape(platform, handle),
      async (attempt, err) => {
        await appendSignal(admin, project_id, 'scrape_failed', {
          platform,
          handle,
          attempt,
          reason: err.message,
        }, 'scrape')
        if (attempt === 3) {
          // Final failure — write notification so UI can prompt user to check their handle
          await appendSignal(admin, project_id, 'user_notification', {
            type: 'scrape_failed_final',
            platform,
            handle,
            message: 'Scraping failed after 3 attempts. Please check that your handle is correct.',
          }, 'scrape')
        }
      }
    )

    // 1. Store raw + normalized in core_scrape_runs
    await admin.from('core_scrape_runs').insert({
      project_id,
      platform,
      handle,
      period_start: today,
      period_end: today,
      raw_json: raw,
      normalized_json: normalized,
      idempotency_key: scrapeIdempotencyKey,
    })

    // 2. Store structured metrics in platform_metrics
    await admin.from('platform_metrics').insert({
      project_id,
      platform,
      handle,
      followers_count: normalized.followers_total,
      avg_engagement_rate: normalized.avg_er_estimated,
      avg_views: normalized.avg_views,
      avg_likes: normalized.avg_likes,
      avg_comments: normalized.avg_comments,
      recent_posts_7d: normalized.posts_last_7d,
      monthly_listeners: normalized.monthly_listeners,
      fetched_at: new Date().toISOString(),
    })

    // 2b. Compare with previous platform_metrics row → detect growth/decline signals
    const { data: prevMetricsRows } = await admin
      .from('platform_metrics')
      .select('followers_count, avg_engagement_rate')
      .eq('project_id', project_id)
      .eq('platform', platform)
      .order('fetched_at', { ascending: false })
      .limit(2)

    if (prevMetricsRows && prevMetricsRows.length >= 2) {
      const curr = prevMetricsRows[0]  // just inserted
      const prev = prevMetricsRows[1]  // previous run

      const followerDelta = curr.followers_count - prev.followers_count
      const followerGrowthPct = prev.followers_count > 0 ? followerDelta / prev.followers_count : 0

      if (followerGrowthPct > 0.05) {
        await appendSignal(admin, project_id, 'growth.acceleration', {
          pct: parseFloat((followerGrowthPct * 100).toFixed(2)),
          delta: followerDelta,
          platform,
        }, 'scrape')
      } else if (followerDelta < 0) {
        await appendSignal(admin, project_id, 'growth.decline', {
          delta: followerDelta,
          platform,
        }, 'scrape')
      }

      const erDrop = prev.avg_engagement_rate > 0
        ? (prev.avg_engagement_rate - curr.avg_engagement_rate) / prev.avg_engagement_rate
        : 0
      if (erDrop > 0.2) {
        await appendSignal(admin, project_id, 'engagement.drop', {
          prev_er: prev.avg_engagement_rate,
          curr_er: curr.avg_engagement_rate,
          drop_pct: parseFloat((erDrop * 100).toFixed(2)),
          platform,
        }, 'scrape')
      }
    }

    // 3. Write Brain Facts
    await writeFact(admin, project_id, 'followers_total', normalized.followers_total, 'scrape')
    await writeFact(admin, project_id, 'avg_engagement_rate', normalized.avg_er_estimated, 'scrape')
    await writeFact(admin, project_id, 'posts_last_30d', normalized.posts_last_30d, 'scrape')
    await writeFact(admin, project_id, 'last_post_date', normalized.last_post_date, 'scrape')
    await writeFact(admin, project_id, 'posts_per_week_average', normalized.posts_per_week_average, 'scrape')
    if (normalized.avg_views > 0) {
      await writeFact(admin, project_id, 'avg_views_last10', normalized.avg_views, 'scrape')
    }

    // Update platforms.focus.follower_count in the nested fact (spec §5 step 6)
    const focusFact = await readFact(admin, project_id, 'platforms.focus') as Record<string, unknown> | null
    if (focusFact && focusFact.platform === platform) {
      await writeFact(admin, project_id, 'platforms.focus', {
        ...focusFact,
        follower_count: normalized.followers_total,
      }, 'scrape')
    }

    // 4. Write Brain Signals
    await appendSignal(admin, project_id, 'growth.followers_total', {
      value: normalized.followers_total,
      platform,
    }, 'scrape')

    await appendSignal(admin, project_id, 'engagement.avg_er_7d', {
      value: normalized.avg_er_estimated,
      platform,
    }, 'scrape')

    await appendSignal(admin, project_id, 'consistency.posts_published_7d', {
      value: normalized.posts_last_7d,
      platform,
    }, 'scrape')

    await appendSignal(admin, project_id, 'consistency.posts_published_30d', {
      value: normalized.posts_last_30d,
      platform,
    }, 'scrape')

    if (normalized.viral_spike) {
      await appendSignal(admin, project_id, 'content_perf.viral_spike', {
        ...normalized.viral_spike,
        platform,
      }, 'scrape')
    }

    // 5. data_correction signal — if follower count differs ≥30% from self-reported
    const selfReported = await readFact(admin, project_id, 'approximate_followers_self_reported')
    if (selfReported !== null) {
      const selfReportedNum = Number(selfReported)
      const diff = Math.abs(normalized.followers_total - selfReportedNum)
      const pctDiff = selfReportedNum > 0 ? diff / selfReportedNum : 0
      if (pctDiff >= 0.30) {
        await appendSignal(admin, project_id, 'data_correction', {
          fact: 'followers',
          self_reported: selfReportedNum,
          actual: normalized.followers_total,
          pct_diff: parseFloat((pctDiff * 100).toFixed(1)),
          platform,
        }, 'scrape')
      }
    }

    await appendSignal(admin, project_id, 'scrape_completed', {
      platform,
      followers: normalized.followers_total,
      avg_er: normalized.avg_er_estimated,
      posts_7d: normalized.posts_last_7d,
    }, 'scrape')

    // 8. Brain Snapshot — immutable capture of state after scrape (spec §7 step 8)
    const allFacts = await readAllFacts(admin, project_id)
    const { data: projectRow2 } = await admin.from('projects').select('current_phase').eq('id', project_id).single()
    await createSnapshot(admin, project_id, 'scrape_light_completed', {
      facts: allFacts,
      phase: projectRow2?.current_phase ?? 'F0',
      signals: [],
    })

  } else {
    await appendSignal(admin, project_id, 'scrape_skipped', {
      platform,
      reason: 'already_ran_today',
      idempotency_key: scrapeIdempotencyKey,
    }, 'scrape')
  }

  // 6. Debit premium credits — cost depends on source (bootstrap=0, cron=5, on_demand=10)
  const creditCost = CREDIT_COST[source]
  if (creditCost > 0) {
    await debitPremiumCredits(admin, project_id, creditCost, `job:${jobId}:scrape_debit`, 'SCRAPE_LIGHT_DEBIT')
  }

  // 7. Mark job done
  await admin
    .from('core_jobs')
    .update({ status: 'done', finished_at: new Date().toISOString() })
    .eq('job_id', jobId)

  // 8. FOCO-first: if this was the FOCO platform, now queue satellite platforms
  // Satellites only run after FOCO completes (spec non-negotiable)
  const { data: projectRow } = await admin
    .from('projects')
    .select('focus_platform, user_id')
    .eq('id', project_id)
    .single()

  if (projectRow?.focus_platform === platform) {
    const { data: satellites } = await admin
      .from('projects_platforms')
      .select('platform, handle')
      .eq('project_id', project_id)
      .eq('role', 'satellite')
      .eq('status', 'active')

    for (const sat of satellites ?? []) {
      if (sat.handle) {
        void requestScrapeLight(admin, project_id, projectRow.user_id, sat.platform, sat.handle, 'cron')
      }
    }
  }

  // 9. Trigger Phase Engine re-evaluation
  await runPhaseEngine(admin, project_id)
}

// ── Job request ────────────────────────────────────────────────────────────

export async function requestScrapeLight(
  admin: AdminClient,
  projectId: string,
  userId: string,
  platform: string,
  handle: string,
  source: ScrapeSource = 'on_demand'
): Promise<{ job_id: string; status: string }> {
  // Handle missing handle — write signal, don't queue a job
  if (!handle?.trim()) {
    await appendSignal(admin, projectId, 'missing_evidence', {
      reason: 'no_handle_provided',
      platform,
    }, 'scrape')
    return { job_id: '', status: 'skipped_no_handle' }
  }

  // Get plan code for rate limit check (bootstrap bypasses rate limit — it's the first ever scrape)
  if (source !== 'bootstrap') {
    const { data: wallet } = await admin
      .from('core_wallets')
      .select('plan_code')
      .eq('project_id', projectId)
      .single()

    const planCode = wallet?.plan_code ?? 'BASE'
    const maxPerDay = RATE_LIMIT[planCode] ?? 1

    // Count done jobs for this project+platform in last 24h
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: doneCount } = await admin
      .from('core_jobs')
      .select('job_id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('job_type', 'scrape_light')
      .eq('status', 'done')
      .filter('payload_json->>platform', 'eq', platform)
      .gte('finished_at', since24h)

    if ((doneCount ?? 0) >= maxPerDay) {
      return { job_id: '', status: 'rate_limited' }
    }
  }

  // Skip if already queued or running for this project+platform
  const { data: activeJob } = await admin
    .from('core_jobs')
    .select('job_id, status')
    .eq('project_id', projectId)
    .eq('job_type', 'scrape_light')
    .in('status', ['queued', 'running'])
    .filter('payload_json->>platform', 'eq', platform)
    .limit(1)
    .single()

  if (activeJob) return { job_id: activeJob.job_id, status: activeJob.status }

  const today = new Date().toISOString().slice(0, 10)
  // Idempotency key: SHA-256 hash per spec
  const idempotencyKey = createHash('sha256')
    .update(`${projectId}:scrape_light:${platform}:${today}`)
    .digest('hex')

  const creditCost = CREDIT_COST[source]

  const { data: newJob } = await admin
    .from('core_jobs')
    .insert({
      project_id: projectId,
      user_id: userId,
      job_type: 'scrape_light',
      status: 'queued',
      priority: 'normal',
      idempotency_key: idempotencyKey,
      cost_premium_credits: creditCost,
      payload_json: { platform, handle, source },
    })
    .select('job_id, status')
    .single()

  return { job_id: newJob!.job_id, status: newJob!.status }
}
