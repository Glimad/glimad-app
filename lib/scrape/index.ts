import { createAdminClient } from '@/lib/supabase/admin'
import { appendSignal, writeFact } from '@/lib/brain'
import { scrapeYouTube } from './youtube'

type AdminClient = ReturnType<typeof createAdminClient>

export async function executeScrapeLightJob(
  admin: AdminClient,
  jobId: string
) {
  // Mark job as running
  await admin
    .from('core_jobs')
    .update({ status: 'running', started_at: new Date().toISOString(), attempts: 1 })
    .eq('job_id', jobId)

  const { data: job } = await admin
    .from('core_jobs')
    .select('*')
    .eq('job_id', jobId)
    .single()

  if (!job) throw new Error('Job not found')

  const { project_id, payload_json } = job
  const platform = (payload_json as { platform: string; handle: string }).platform
  const handle = (payload_json as { platform: string; handle: string }).handle

  const today = new Date().toISOString().slice(0, 10)
  const scrapeIdempotencyKey = `${platform}:${handle}:${today}`

  // Dedupe: skip if already ran today
  const { data: existingRun } = await admin
    .from('core_scrape_runs')
    .select('run_id')
    .eq('idempotency_key', scrapeIdempotencyKey)
    .single()

  if (!existingRun) {
    if (platform === 'youtube') {
      const { raw, normalized } = await scrapeYouTube(handle)

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

      // Write brain facts
      await writeFact(admin, project_id, 'followers_total', normalized.followers_total, 'scrape')
      await writeFact(admin, project_id, 'avg_engagement_rate', normalized.avg_er_estimated, 'scrape')
      await writeFact(admin, project_id, 'avg_views_last10', normalized.avg_views_last10, 'scrape')
      await writeFact(admin, project_id, 'posts_last_30d', normalized.posts_last_30d, 'scrape')

      // Write brain signals
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

      await appendSignal(admin, project_id, 'scrape_completed', {
        platform,
        followers: normalized.followers_total,
        avg_er: normalized.avg_er_estimated,
        posts_7d: normalized.posts_last_7d,
      }, 'scrape')

    } else {
      // Platform not supported yet — write a signal
      await appendSignal(admin, project_id, 'scrape_skipped', {
        platform,
        reason: 'platform_not_supported_yet',
      }, 'scrape')
    }
  }

  // Debit premium credits (5 per scrape)
  const { data: wallet } = await admin
    .from('core_wallets')
    .select('wallet_id, premium_credits_balance')
    .eq('project_id', project_id)
    .single()

  if (wallet && wallet.premium_credits_balance >= 5) {
    const ledgerKey = `job:${jobId}:scrape_debit`
    const { data: existingDebit } = await admin
      .from('core_ledger')
      .select('ledger_id')
      .eq('idempotency_key', ledgerKey)
      .single()

    if (!existingDebit) {
      const newBalance = wallet.premium_credits_balance - 5
      await admin.from('core_ledger').insert({
        project_id,
        kind: 'debit',
        amount_premium: -5,
        reason_key: 'SCRAPE_LIGHT_DEBIT',
        idempotency_key: ledgerKey,
        metadata_json: { platform },
      })
      await admin
        .from('core_wallets')
        .update({ premium_credits_balance: newBalance, updated_at: new Date().toISOString() })
        .eq('wallet_id', wallet.wallet_id)
    }
  }

  // Mark job done
  await admin
    .from('core_jobs')
    .update({ status: 'done', finished_at: new Date().toISOString() })
    .eq('job_id', jobId)
}

export async function requestScrapeLight(
  admin: AdminClient,
  projectId: string,
  userId: string,
  platform: string,
  handle: string
): Promise<{ job_id: string; status: string }> {
  const today = new Date().toISOString().slice(0, 10)
  const idempotencyKey = `${projectId}:scrape_light:${platform}:${today}`

  // Check for existing job today
  const { data: existing } = await admin
    .from('core_jobs')
    .select('job_id, status')
    .eq('idempotency_key', idempotencyKey)
    .single()

  if (existing) return { job_id: existing.job_id, status: existing.status }

  const { data: newJob } = await admin
    .from('core_jobs')
    .insert({
      project_id: projectId,
      user_id: userId,
      job_type: 'scrape_light',
      status: 'queued',
      priority: 'normal',
      idempotency_key: idempotencyKey,
      cost_premium_credits: 5,
      payload_json: { platform, handle },
    })
    .select('job_id, status')
    .single()

  return { job_id: newJob!.job_id, status: newJob!.status }
}
