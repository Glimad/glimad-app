import { createAdminClient } from '@/lib/supabase/admin'
import { writeFact, appendSignal, createSnapshot, readAllFacts } from '@/lib/brain/index'
import { runPhaseEngine } from '@/lib/engines/phase-engine'
import { normalizeProjectType } from '@/lib/onboarding/config'
import { scrapeWebsite, inferFromWebsite } from '@/lib/scrape/website'

type AdminClient = ReturnType<typeof createAdminClient>

function normalizePlatform(raw: string): string | null {
  const lower = raw.toLowerCase().trim()
  if (!lower) return null
  if (lower.includes('instagram')) return 'instagram'
  if (lower.includes('tiktok')) return 'tiktok'
  if (lower.includes('youtube')) return 'youtube'
  if (lower.includes('twitter') || lower.includes('x (twitter)')) return 'twitter'
  if (lower.includes('linkedin')) return 'linkedin'
  if (lower.includes('facebook')) return 'facebook'
  if (lower.includes('spotify')) return 'spotify'
  if (lower.includes('behance')) return 'behance'
  if (lower.includes('pinterest')) return 'pinterest'
  if (lower.includes('website') || lower.includes('sitio web')) return 'website'
  return lower
}

export async function seedBrainFromOnboarding(
  admin: AdminClient,
  userId: string,
  projectId: string
) {
  const { data: session } = await admin
    .from('onboarding_sessions')
    .select('id, responses_json, experiment_variant')
    .eq('converted_to_user_id', userId)
    .eq('status', 'completed')
    .single()

  if (!session) return

  const r = (session.responses_json ?? {}) as Record<string, unknown>

  // New fields from the dynamic assessment
  const projectType   = normalizeProjectType(String(r['project_type'] ?? ''))
  const projectName   = String(r['project_name'] ?? '')
  const journeyStage  = String(r['journey_stage'] ?? 'starting')
  const vision        = String(r['vision'] ?? '')
  const goals         = Array.isArray(r['goals']) ? r['goals'] as string[] : []
  const blockers      = Array.isArray(r['blockers']) ? r['blockers'] as string[] : []
  const revenueStatus = String(r['revenue_status'] ?? '')
  const supportNeeds  = Array.isArray(r['support_needs']) ? r['support_needs'] as string[] : []
  const noPresence    = Boolean(r['no_presence'])

  const selectedPlatformsRaw = Array.isArray(r['selected_platforms']) ? r['selected_platforms'] as string[] : []
  const platformUrls = (r['platform_urls'] ?? {}) as Record<string, string>

  const locale   = r['locale']   ? String(r['locale'])   : null
  const timezone = r['timezone'] ? String(r['timezone']) : null

  // Website is a conversion channel, not a social platform — extract its URL
  // separately and exclude it from FOCO / platforms.* derivation.
  const websiteRaw = selectedPlatformsRaw.find(pid => normalizePlatform(pid) === 'website') ?? null
  const websiteUrl = websiteRaw ? (platformUrls[websiteRaw] ?? '').trim() : ''
  const socialPlatformsRaw = selectedPlatformsRaw.filter(pid => normalizePlatform(pid) !== 'website')

  // Determine focus platform (first selected social platform; website never qualifies)
  const focusPlatformRaw = socialPlatformsRaw[0] ?? null
  const focusPlatform    = focusPlatformRaw ? normalizePlatform(focusPlatformRaw) : null
  const focusHandle      = focusPlatformRaw ? (platformUrls[focusPlatformRaw] ?? '').trim() : ''

  const flowVariant = (session.experiment_variant as string | null) ?? `A_${journeyStage}`

  // Build platforms.all array — includes website alongside social platforms.
  // Website is still tracked separately via website.url, but remains in platforms.all
  // so downstream consumers see the full declared surface area.
  const platformsAll = selectedPlatformsRaw.map(pid => ({
    platform: normalizePlatform(pid) ?? pid,
    handle: (platformUrls[pid] ?? '').trim() || null,
    follower_count: 0,
  }))

  // Write canonical Brain Facts
  await Promise.all([
    // identity.*
    writeFact(admin, projectId, 'identity.project_type',  projectType,  'brain-seed'),
    writeFact(admin, projectId, 'identity.project_name',  projectName,  'brain-seed'),
    writeFact(admin, projectId, 'identity.journey_stage', journeyStage, 'brain-seed'),
    writeFact(admin, projectId, 'identity.vision',        vision,       'brain-seed'),
    writeFact(admin, projectId, 'identity.goals',         goals,        'brain-seed'),
    writeFact(admin, projectId, 'identity.blockers',      blockers,     'brain-seed'),
    writeFact(admin, projectId, 'identity.revenue_status', revenueStatus, 'brain-seed'),
    writeFact(admin, projectId, 'identity.support_needs',  supportNeeds,  'brain-seed'),
    writeFact(admin, projectId, 'identity.flow_variant',   flowVariant,   'brain-seed'),

    // identity.niche — derived from projectType + vision for compatibility with studio routes
    writeFact(admin, projectId, 'identity.niche', {
      niche: projectType || null,
      subniche: null,
      target_audience: null,
      unique_angle: vision || null,
    }, 'brain-seed'),

    // capabilities.current — always reset to 0 at onboarding
    writeFact(admin, projectId, 'capabilities.current', {
      execution: 0, audienceSignal: 0, clarity: 0, readiness: 0,
    }, 'brain-seed'),

    // platforms.focus
    writeFact(admin, projectId, 'platforms.focus', focusPlatform
      ? { platform: focusPlatform, handle: focusHandle || null, follower_count: 0 }
      : null,
    'brain-seed'),

    // platforms.all
    writeFact(admin, projectId, 'platforms.all', platformsAll.length > 0 ? platformsAll : null, 'brain-seed'),

    // website.url — stored separately from platforms.* because website is a conversion channel, not a FOCO
    writeFact(admin, projectId, 'website.url', websiteUrl || null, 'brain-seed'),
  ])

  // Write user_preferences
  await admin.from('user_preferences').upsert(
    {
      project_id: projectId,
      ...(locale   ? { locale }   : {}),
      ...(timezone ? { timezone } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id' }
  )

  // Update project
  await admin.from('projects').update({
    name: projectName || undefined,
    onboarding_session_id: session.id,
    focus_platform: focusPlatform,
    ...(focusHandle && focusPlatform ? { focus_platform_handle: focusHandle } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', projectId)

  // Website scrape + LLM inference (Phase 2 of Fix 3).
  // Runs when a website URL was provided. Populates website.scrape and
  // website.inference brain facts so downstream phases / the FOCO confirmation
  // mission can propose a sensible platform without touching canonical
  // identity.niche / platforms.focus (those are written on user confirmation).
  if (websiteUrl) {
    try {
      const scrape = await scrapeWebsite(websiteUrl)
      if (scrape) {
        await writeFact(admin, projectId, 'website.scrape', scrape, 'website-scrape')
        const inference = await inferFromWebsite(scrape)
        if (inference) {
          await writeFact(admin, projectId, 'website.inference', inference, 'website-scrape')
          await appendSignal(admin, projectId, 'website_inferred', {
            website_url: websiteUrl,
            niche: inference.niche,
            suggested_platforms: inference.suggested_platforms,
            confidence: inference.confidence,
          }, 'website-scrape')
        } else {
          await appendSignal(admin, projectId, 'website_inference_failed', {
            website_url: websiteUrl,
            reason: 'llm_unavailable_or_invalid_response',
          }, 'website-scrape')
        }
      } else {
        await appendSignal(admin, projectId, 'website_scrape_failed', {
          website_url: websiteUrl,
          reason: 'fetch_failed_or_non_html',
        }, 'website-scrape')
      }
    } catch (err) {
      await appendSignal(admin, projectId, 'website_scrape_failed', {
        website_url: websiteUrl,
        reason: (err as Error).message?.slice(0, 200) ?? 'unknown_error',
      }, 'website-scrape')
    }
  }

  // Brain Signals
  if (focusPlatform) {
    await appendSignal(admin, projectId, 'platform_declared', {
      platform: focusPlatform,
      all_platforms: platformsAll.map(p => p.platform),
      website_url: websiteUrl || null,
    }, 'onboarding')
  } else if (websiteUrl) {
    // User has a website but no social FOCO. The Stripe webhook will substitute
    // PLATFORM_STRATEGY_PICKER_V1 → WEBSITE_FOCO_CONFIRM_V1 in its Core Flow
    // creation loop after seeing website.url in the facts we wrote above, so
    // we don't instantiate the mission here (would just duplicate).
    await appendSignal(admin, projectId, 'missing_evidence', {
      reason: 'scrape_skipped — website only; FOCO confirmation required',
      website_url: websiteUrl,
    }, 'onboarding')
  } else if (noPresence) {
    await appendSignal(admin, projectId, 'missing_evidence', {
      reason: 'scrape_skipped — no platform presence at onboarding (Starting from Zero)',
    }, 'onboarding')
  }

  await appendSignal(admin, projectId, 'onboarding_completed', {
    session_id: session.id,
    flow_variant: flowVariant,
    journey_stage: journeyStage,
  }, 'onboarding')

  // Phase Engine
  const phaseResult = await runPhaseEngine(admin, projectId)

  // Brain Snapshot
  const allFacts = await readAllFacts(admin, projectId)
  await createSnapshot(admin, projectId, 'onboarding_completed', { phase: phaseResult.phase, facts: allFacts })
}
