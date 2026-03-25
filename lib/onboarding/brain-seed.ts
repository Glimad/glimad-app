import { createAdminClient } from '@/lib/supabase/admin'
import { writeFact, appendSignal, createSnapshot, readAllFacts } from '@/lib/brain/index'
import { computeInitialPhase } from '@/lib/brain/phase'

type AdminClient = ReturnType<typeof createAdminClient>

// Platform options that mean "no platform"
const NO_PLATFORM_VALUES = ['ninguna por ahora', 'none', 'no platforms yet']

// Normalize platform string to our internal key
function normalizePlatform(raw: string): string | null {
  const lower = raw.toLowerCase()
  if (NO_PLATFORM_VALUES.includes(lower)) return null
  if (lower.includes('instagram')) return 'instagram'
  if (lower.includes('tiktok')) return 'tiktok'
  if (lower.includes('youtube')) return 'youtube'
  if (lower.includes('twitter') || lower.includes('x')) return 'twitter'
  if (lower.includes('spotify')) return 'spotify'
  return lower
}

function parseFaceVisibility(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes('no') || lower.includes('prefiero no')) return 'never'
  if (lower.includes('depende') || lower.includes('depends')) return 'sometimes'
  return 'always'
}

function parseAvailabilityHours(raw: string): number {
  const lower = raw.toLowerCase()
  if (lower.includes('menos de 1') || lower.includes('less than 1')) return 1
  if (lower.includes('1-2') || lower.includes('1–2')) return 2
  if (lower.includes('3-5') || lower.includes('3–5')) return 4
  if (lower.includes('6-10') || lower.includes('6–10')) return 8
  if (lower.includes('más de 10') || lower.includes('more than 10')) return 12
  return 2
}

export async function seedBrainFromOnboarding(
  admin: AdminClient,
  userId: string,
  projectId: string
) {
  // 1. Get onboarding session for this user
  const { data: session } = await admin
    .from('onboarding_sessions')
    .select('id, responses_json')
    .eq('converted_to_user_id', userId)
    .eq('status', 'completed')
    .single()

  if (!session) return

  const r = (session.responses_json ?? {}) as Record<string, unknown>

  // 2. Write Brain Facts from each answer
  const interestsRaw = r['interests']
  const goal90d = String(r['goal_90d'] ?? '')
  const blocker1 = String(r['blocker_1'] ?? '')
  const facePref = String(r['face_pref'] ?? '')
  const timeBudget = String(r['time_budget_week'] ?? '')
  const platformRaw = String(r['platform_current'] ?? '')

  const focusPlatform = normalizePlatform(platformRaw)

  await Promise.all([
    writeFact(admin, projectId, 'niche_raw', interestsRaw, 'onboarding'),
    writeFact(admin, projectId, 'primary_goal', goal90d, 'onboarding'),
    writeFact(admin, projectId, 'main_blocker', blocker1, 'onboarding'),
    writeFact(admin, projectId, 'on_camera_comfort', facePref, 'onboarding'),
    writeFact(admin, projectId, 'hours_per_week', timeBudget, 'onboarding'),
    writeFact(admin, projectId, 'current_platforms', platformRaw, 'onboarding'),
  ])

  // 3. Write user_preferences
  await admin.from('user_preferences').upsert(
    {
      project_id: projectId,
      face_visibility: parseFaceVisibility(facePref),
      availability_hours_week: parseAvailabilityHours(timeBudget),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id' }
  )

  // 4. Update project with focus platform + onboarding session link
  await admin.from('projects').update({
    onboarding_session_id: session.id,
    focus_platform: focusPlatform,
    updated_at: new Date().toISOString(),
  }).eq('id', projectId)

  // 5. Compute initial phase
  const factsMap: Record<string, unknown> = {
    niche_raw: interestsRaw,
    primary_goal: goal90d,
    main_blocker: blocker1,
    on_camera_comfort: facePref,
    hours_per_week: timeBudget,
    current_platforms: platformRaw,
  }
  const phase = computeInitialPhase(factsMap)
  await writeFact(admin, projectId, 'current_phase', phase, 'phase_engine')
  await admin.from('projects').update({ phase_code: phase }).eq('id', projectId)

  // 6. Write Brain Signal + Snapshot
  if (focusPlatform) {
    await appendSignal(admin, projectId, 'platform_declared', {
      platform: focusPlatform,
      raw: platformRaw,
    }, 'onboarding')
  } else {
    await appendSignal(admin, projectId, 'missing_evidence', {
      reason: 'scrape_skipped — no platform handle provided at onboarding',
    }, 'onboarding')
  }

  await appendSignal(admin, projectId, 'onboarding_completed', {
    session_id: session.id,
    phase_assigned: phase,
  }, 'onboarding')

  const allFacts = await readAllFacts(admin, projectId)
  await createSnapshot(admin, projectId, 'onboarding_completed', phase, allFacts)
}
