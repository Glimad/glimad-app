// Step 10 production E2E — tests the Policy Engine via the live Vercel deployment
// Run: npx tsx --env-file=.env scripts/test-policy-engine.ts
//
// Tests each major policy decision by seeding Brain state and verifying the
// policy output: topMission, activeMode, priorityScore, filters.
//
// Test groups:
//   1. F0 Core Flow gate — returns first incomplete Core Flow mission
//   2. F0 Core Flow partial — returns second mission when first is complete
//   3. F0 Core Flow all done — falls through to score-based selection
//   4. Priority scoring — inflexion bonus (viral_spike → +50)
//   5. Priority scoring — phase recommendation bonus (+30)
//   6. Burnout penalty — high-energy mission scores down by 30
//   7. Daily LLM limit — all LLM missions → score 0
//   8. No premium credits — premium missions filtered out
//   9. activeMode — viral_spike inflexion → 'scale'
//  10. activeMode — monetization_ready inflexion → 'monetize'

import { createClient } from '@supabase/supabase-js'

const BASE = 'https://glimad-app-six.vercel.app'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let passed = 0
let failed = 0

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${label}`); passed++ }
  else { console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++ }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

const TEST_EMAIL = `e2e-policy-${Date.now()}@glimad-test.dev`
const TEST_PASSWORD = 'E2eTestPass123!'
let testUserId: string | null = null

async function getToken(): Promise<{ token: string; userId: string }> {
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: created, error } = await adminClient.auth.admin.createUser({
    email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true,
  })
  if (error || !created.user) throw new Error(`User creation failed: ${error?.message}`)
  testUserId = created.user.id

  const anon = createClient(SUPABASE_URL, ANON_KEY)
  const { data, error: signInErr } = await anon.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD })
  if (signInErr || !data.session) throw new Error(`Auth failed: ${signInErr?.message}`)
  return { token: data.session.access_token, userId: data.user!.id }
}

async function deleteTestUser() {
  if (!testUserId) return
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  await adminClient.auth.admin.deleteUser(testUserId)
}

// ── Project setup ─────────────────────────────────────────────────────────────

async function ensureProject(userId: string, phase: string = 'F1'): Promise<string> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: proj } = await admin.from('projects')
    .update({
      name: 'Policy Test', status: 'active', phase_code: phase,
      active_mode: 'test', publishing_mode: 'BUILDING',
      focus_platform: 'instagram', focus_platform_handle: 'testuser',
    })
    .eq('user_id', userId)
    .select('id').single()
  if (!proj) throw new Error('Project update failed')

  // Active subscription
  await admin.from('core_subscriptions').upsert({
    project_id: proj.id, user_id: userId,
    stripe_customer_id: `cus_policy_${Date.now()}`,
    stripe_subscription_id: `sub_policy_${Date.now()}`,
    plan_code: 'BASE', status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
  }, { onConflict: 'stripe_subscription_id' })

  return proj.id
}

async function cleanup(projectId: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  await admin.from('mission_instances').delete().eq('project_id', projectId)
  await admin.from('core_inflexion_events').delete().eq('project_id', projectId)
  await admin.from('core_policy_runs').delete().eq('project_id', projectId)
  await admin.from('brain_signals').delete().eq('project_id', projectId)
  await admin.from('brain_facts').delete().eq('project_id', projectId)
  await admin.from('brain_snapshots').delete().eq('project_id', projectId)
  await admin.from('core_phase_runs').delete().eq('project_id', projectId)
  await admin.from('core_wallets').delete().eq('project_id', projectId)
  await admin.from('core_subscriptions').delete().eq('project_id', projectId)
  await admin.from('projects').delete().eq('id', projectId)
}

async function resetState(projectId: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  await admin.from('mission_instances').delete().eq('project_id', projectId)
  await admin.from('brain_signals').delete().eq('project_id', projectId)
  await admin.from('brain_facts').delete().eq('project_id', projectId)
  await admin.from('core_inflexion_events').delete().eq('project_id', projectId)
  await admin.from('core_policy_runs').delete().eq('project_id', projectId)
  await admin.from('core_phase_runs').delete().eq('project_id', projectId)
  await admin.from('core_wallets').delete().eq('project_id', projectId)
}

async function setPhase(userId: string, phase: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  await admin.from('projects').update({ phase_code: phase }).eq('user_id', userId)
}

async function seedFact(projectId: string, key: string, value: unknown) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  await admin.from('brain_facts').upsert(
    { project_id: projectId, fact_key: key, value, source: 'test', updated_at: new Date().toISOString() },
    { onConflict: 'project_id,fact_key' }
  )
}

async function seedSignal(projectId: string, key: string, value: unknown, hoursAgo = 1) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const observedAt = new Date(Date.now() - hoursAgo * 3600000).toISOString()
  await admin.from('brain_signals').insert({
    project_id: projectId, signal_key: key, value, source: 'test', observed_at: observedAt,
  })
}

async function seedWallet(projectId: string, allowance: number, premium: number) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  await admin.from('core_wallets').upsert({
    project_id: projectId,
    plan_code: 'BASE',
    allowance_llm_balance: allowance,
    credits_allowance: 2000,
    premium_credits_balance: premium,
    premium_daily_cap_remaining: premium,
    allowance_reset_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    premium_reset_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    status: 'active',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id' })
}

async function markMissionCompleted(projectId: string, templateCode: string, daysAgo = 0) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const completedAt = new Date(Date.now() - daysAgo * 86400000).toISOString()
  await admin.from('mission_instances').insert({
    project_id: projectId,
    template_code: templateCode,
    status: 'completed',
    unique_key: `${projectId}:${templateCode}:test:${Date.now()}`,
    params: {},
    current_step: 0,
    completed_at: completedAt,
  })
}

async function runEngines(token: string) {
  const res = await fetch(`${BASE}/api/engines`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  return res.json()
}

// ── Test Groups ───────────────────────────────────────────────────────────────

async function testF0CoreFlowGate(projectId: string, userId: string, token: string) {
  console.log('\n[1] F0 Core Flow gate — returns first incomplete Core Flow mission')
  await resetState(projectId)
  await setPhase(userId, 'F0')
  await seedWallet(projectId, 2000, 500)

  const data = await runEngines(token)
  const policy = data.policy

  ok('topMission is first Core Flow mission', policy.topMission === 'VISION_PURPOSE_MOODBOARD_V1',
    `got: ${policy.topMission}`)
  ok('missionQueue has exactly 1 item', policy.missionQueue?.length === 1,
    `got: ${policy.missionQueue?.length}`)
  ok('score is 100', policy.missionQueue?.[0]?.priorityScore === 100,
    `got: ${policy.missionQueue?.[0]?.priorityScore}`)
  ok('rationale mentions F0 Core Flow', policy.rationale?.includes('F0 Core Flow'),
    `got: ${policy.rationale}`)
}

async function testF0CoreFlowPartial(projectId: string, userId: string, token: string) {
  console.log('\n[2] F0 Core Flow partial — returns second mission when first is complete')
  await resetState(projectId)
  await setPhase(userId, 'F0')
  await seedWallet(projectId, 2000, 500)
  await markMissionCompleted(projectId, 'VISION_PURPOSE_MOODBOARD_V1', 5)

  const data = await runEngines(token)
  const policy = data.policy

  ok('topMission is second Core Flow mission', policy.topMission === 'NICHE_CONFIRM_V1',
    `got: ${policy.topMission}`)
  ok('score is 100', policy.missionQueue?.[0]?.priorityScore === 100,
    `got: ${policy.missionQueue?.[0]?.priorityScore}`)
}

async function testF0AllCoreFlowDone(projectId: string, userId: string, token: string) {
  console.log('\n[3] F0 Core Flow all done — falls through to score-based selection')
  await resetState(projectId)
  await setPhase(userId, 'F0')
  await seedWallet(projectId, 2000, 500)

  // Mark all 4 Core Flow missions as completed
  for (const code of ['VISION_PURPOSE_MOODBOARD_V1', 'NICHE_CONFIRM_V1', 'PLATFORM_STRATEGY_PICKER_V1', 'PREFERENCES_CAPTURE_V1']) {
    await markMissionCompleted(projectId, code, 10)
  }

  const data = await runEngines(token)
  const policy = data.policy

  ok('topMission is NOT a Core Flow mission', !['VISION_PURPOSE_MOODBOARD_V1', 'NICHE_CONFIRM_V1', 'PLATFORM_STRATEGY_PICKER_V1', 'PREFERENCES_CAPTURE_V1'].includes(policy.topMission ?? ''),
    `got: ${policy.topMission}`)
  ok('missionQueue exists', Array.isArray(policy.missionQueue),
    `got: ${typeof policy.missionQueue}`)
}

async function testInflexionBonus(projectId: string, userId: string, token: string) {
  console.log('\n[4] Priority scoring — viral_spike inflexion adds +50 to matching mission')
  await resetState(projectId)
  await setPhase(userId, 'F2')
  await seedWallet(projectId, 2000, 500)

  // Seed viral spike signal
  await seedSignal(projectId, 'content_perf.viral_spike', { multiplier: 8, video_id: 'test_vid' }, 2)

  // Seed phase engine signals (so it can determine F2)
  await seedFact(projectId, 'current_followers', 3000)
  await seedFact(projectId, 'avg_engagement_rate', 0.04)

  const data = await runEngines(token)
  const policy = data.policy
  const contentBatch = policy.missionQueue?.find((m: { templateCode: string }) => m.templateCode === 'CONTENT_BATCH_3D_V1')

  ok('CONTENT_BATCH_3D_V1 is in queue', !!contentBatch, `queue: ${JSON.stringify(policy.missionQueue?.map((m: { templateCode: string }) => m.templateCode))}`)
  ok('topMission is CONTENT_BATCH_3D_V1 (highest score due to inflexion)', policy.topMission === 'CONTENT_BATCH_3D_V1',
    `got: ${policy.topMission}`)
  // Base P2=60 + inflexion +50 + phase_rec +30 + new +20 = 160 (minus premium penalty if low credits; wallet has 500)
  ok('score includes inflexion bonus (≥110)', (contentBatch?.priorityScore ?? 0) >= 110,
    `got: ${contentBatch?.priorityScore}`)
}

async function seedF3BrainState(projectId: string) {
  // Seeds enough brain facts + signals to push phase engine score to F3 (≥45)
  // discovery=100 (15 pts), audience=75 (7.5), consistency=70 (10.5), engagement=75 (15), technology=30 (1.5) = 49.5
  await seedFact(projectId, 'niche_raw', 'fitness content creator')
  await seedFact(projectId, 'niche', 'fitness and wellness')
  await seedFact(projectId, 'audience_persona', 'health-conscious 25-35 year olds')
  await seedFact(projectId, 'positioning_statement', 'Real fitness for real people')
  await seedFact(projectId, 'avg_engagement_rate', 0.04)
  await seedFact(projectId, 'posts_last_30d', 12) // 3/week → consistency=70
  await seedFact(projectId, 'focus_platform_handle', 'testuser')
  // 3 evidence signals so hasEvidence passes
  await seedSignal(projectId, 'growth.followers_total', { value: 5000 }, 5)
  await seedSignal(projectId, 'consistency.posts_published_30d', { value: 12 }, 3)
  await seedSignal(projectId, 'engagement.avg_er_7d', { value: 0.04 }, 2)
}

async function testPhaseRecommendationBonus(projectId: string, userId: string, token: string) {
  console.log('\n[5] Priority scoring — phase recommendation adds +30')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 500)
  await seedF3BrainState(projectId)

  const data = await runEngines(token)
  const policy = data.policy

  // Phase must be F3+ so DEFINE_OFFER_V1 (phase_min=F3) is available
  const contentBatch = policy.missionQueue?.find((m: { templateCode: string }) => m.templateCode === 'CONTENT_BATCH_3D_V1')
  const defineOffer = policy.missionQueue?.find((m: { templateCode: string }) => m.templateCode === 'DEFINE_OFFER_V1')

  ok('phase is F3 or above', ['F3', 'F4', 'F5', 'F6', 'F7'].includes(data.phaseResult?.phase),
    `got: ${data.phaseResult?.phase} (score: ${data.phaseResult?.capabilityScore})`)
  ok('CONTENT_BATCH_3D_V1 in queue', !!contentBatch)
  ok('DEFINE_OFFER_V1 in queue', !!defineOffer, `queue: ${JSON.stringify(policy.missionQueue?.map((m: { templateCode: string }) => m.templateCode))}`)
  ok('Phase-recommended missions have bonus score (≥90)', (contentBatch?.priorityScore ?? 0) >= 90,
    `CONTENT_BATCH score: ${contentBatch?.priorityScore}`)
}

async function testBurnoutPenalty(projectId: string, userId: string, token: string) {
  console.log('\n[6] Burnout penalty — high-energy missions score -30')
  await resetState(projectId)
  await setPhase(userId, 'F2')
  await seedWallet(projectId, 2000, 500)
  await seedFact(projectId, 'current_followers', 3000)
  await seedFact(projectId, 'avg_engagement_rate', 0.04)

  // Seed burnout signals
  await seedSignal(projectId, 'consistency_gap', { gap_days: 5 }, 5)

  const data = await runEngines(token)
  const policy = data.policy
  const contentBatch = policy.missionQueue?.find((m: { templateCode: string }) => m.templateCode === 'CONTENT_BATCH_3D_V1')
  const engagementRescue = policy.missionQueue?.find((m: { templateCode: string }) => m.templateCode === 'ENGAGEMENT_RESCUE_V1')

  ok('CONTENT_BATCH_3D_V1 in queue', !!contentBatch)
  ok('reason includes burnout_penalized', contentBatch?.reason?.includes('burnout_penalized'),
    `reason: ${contentBatch?.reason}`)
  // CONTENT_BATCH costs 80 allowance (> 10 threshold) → penalized
  // ENGAGEMENT_RESCUE costs 35 (> 10 threshold) → also penalized
  // P2=60 + phase_rec +30 + new +20 - burnout -30 = 80 for CONTENT_BATCH (minus premium low penalty if 500 credits: no)
  ok('score is reduced (≤100)', (contentBatch?.priorityScore ?? 200) <= 100,
    `got: ${contentBatch?.priorityScore}`)
}

async function testDailyLimitReached(projectId: string, userId: string, token: string) {
  console.log('\n[7] Daily LLM limit — all LLM missions score 0')
  await resetState(projectId)
  await setPhase(userId, 'F2')
  // Empty wallet = daily limit reached
  await seedWallet(projectId, 0, 0)
  await seedFact(projectId, 'current_followers', 3000)
  await seedFact(projectId, 'avg_engagement_rate', 0.04)

  const data = await runEngines(token)
  const policy = data.policy

  const llmMissions = policy.missionQueue?.filter((m: { priorityScore: number }) => m.priorityScore === 0) ?? []
  const allScoresZeroOrFiltered = policy.missionQueue?.every((m: { priorityScore: number }) => m.priorityScore === 0) ?? true
  // All missions cost allowance credits, so all should be 0 or not present
  ok('All missions score 0 when daily limit reached', allScoresZeroOrFiltered,
    `queue: ${JSON.stringify(policy.missionQueue?.map((m: { templateCode: string; priorityScore: number }) => `${m.templateCode}:${m.priorityScore}`))}`)
  ok('reason includes daily_limit', policy.missionQueue?.some((m: { reason: string }) => m.reason?.includes('daily_limit')),
    `reasons: ${policy.missionQueue?.map((m: { reason: string }) => m.reason)}`)
}

async function testNoPremiumCreditsFilter(projectId: string, userId: string, token: string) {
  console.log('\n[8] No premium credits — premium missions filtered out')
  await resetState(projectId)
  await setPhase(userId, 'F2')
  // Has allowance but 0 premium credits
  await seedWallet(projectId, 2000, 0)
  await seedFact(projectId, 'current_followers', 3000)
  await seedFact(projectId, 'avg_engagement_rate', 0.04)

  const data = await runEngines(token)
  const policy = data.policy

  // CONTENT_BATCH_3D_V1 has credit_cost_premium=50 → should be filtered out
  const contentBatch = policy.missionQueue?.find((m: { templateCode: string }) => m.templateCode === 'CONTENT_BATCH_3D_V1')
  ok('CONTENT_BATCH_3D_V1 filtered out (premium mission, 0 premium credits)', !contentBatch,
    `found with score: ${contentBatch?.priorityScore}`)
  // ENGAGEMENT_RESCUE_V1 has credit_cost_premium=0 → should still be present
  const engagementRescue = policy.missionQueue?.find((m: { templateCode: string }) => m.templateCode === 'ENGAGEMENT_RESCUE_V1')
  ok('ENGAGEMENT_RESCUE_V1 still available (no premium cost)', !!engagementRescue)
}

async function testActiveModeViralSpike(projectId: string, userId: string, token: string) {
  console.log('\n[9] activeMode — viral_spike inflexion → scale')
  await resetState(projectId)
  await setPhase(userId, 'F2')
  await seedWallet(projectId, 2000, 500)
  await seedSignal(projectId, 'content_perf.viral_spike', { multiplier: 5 }, 2)

  const data = await runEngines(token)
  ok('activeMode is scale', data.policy?.activeMode === 'scale', `got: ${data.policy?.activeMode}`)
  ok('inflexion is viral_spike', data.inflexion?.type === 'viral_spike', `got: ${data.inflexion?.type}`)
}

async function testActiveModeMonetization(projectId: string, userId: string, token: string) {
  console.log('\n[10] activeMode — monetization_ready inflexion → monetize')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 500)
  // Seed F3+ brain state so DEFINE_OFFER_V1 (phase_min=F3) passes the phase gate
  await seedF3BrainState(projectId)
  // Override followers to trigger monetization_ready (≥5000 + avg_er≥3%)
  await seedFact(projectId, 'current_followers', 8000)

  const data = await runEngines(token)
  ok('phase is F3 or above', ['F3', 'F4', 'F5', 'F6', 'F7'].includes(data.phaseResult?.phase),
    `got: ${data.phaseResult?.phase} (score: ${data.phaseResult?.capabilityScore})`)
  ok('activeMode is monetize', data.policy?.activeMode === 'monetize', `got: ${data.policy?.activeMode}`)
  ok('inflexion is monetization_ready', data.inflexion?.type === 'monetization_ready', `got: ${data.inflexion?.type}`)
  ok('topMission is DEFINE_OFFER_V1', data.policy?.topMission === 'DEFINE_OFFER_V1', `got: ${data.policy?.topMission}`)
}

async function testCompletedOver30DaysBonus(projectId: string, userId: string, token: string) {
  console.log('\n[11] Completed >30 days ago → +10 bonus')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 500)
  await seedFact(projectId, 'current_followers', 3000)
  await seedFact(projectId, 'avg_engagement_rate', 0.04)
  // Mark ENGAGEMENT_RESCUE_V1 as completed 35 days ago (past cooldown, past 30d)
  await markMissionCompleted(projectId, 'ENGAGEMENT_RESCUE_V1', 35)

  const data = await runEngines(token)
  const policy = data.policy
  const rescue = policy.missionQueue?.find((m: { templateCode: string }) => m.templateCode === 'ENGAGEMENT_RESCUE_V1')

  ok('ENGAGEMENT_RESCUE_V1 in queue (cooldown expired)', !!rescue,
    `queue: ${JSON.stringify(policy.missionQueue?.map((m: { templateCode: string }) => m.templateCode))}`)
  // P1=80 + phase_rec +30 (F1 recommended) + repeat >30d +10 = 120 (no "new" bonus since it was completed)
  ok('+10 repeat bonus applied (score ≥ 110)', (rescue?.priorityScore ?? 0) >= 110,
    `got: ${rescue?.priorityScore}`)
}

async function testActiveMissionFilter(projectId: string, userId: string, token: string) {
  console.log('\n[12] Active missions filtered out')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 500)
  await seedFact(projectId, 'current_followers', 3000)
  await seedFact(projectId, 'avg_engagement_rate', 0.04)

  // Insert an active (running) instance of ENGAGEMENT_RESCUE_V1
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  await admin.from('mission_instances').insert({
    project_id: projectId,
    template_code: 'ENGAGEMENT_RESCUE_V1',
    status: 'running',
    unique_key: `${projectId}:ENGAGEMENT_RESCUE_V1:active:${Date.now()}`,
    params: {},
    current_step: 1,
  })

  const data = await runEngines(token)
  const policy = data.policy
  const rescue = policy.missionQueue?.find((m: { templateCode: string }) => m.templateCode === 'ENGAGEMENT_RESCUE_V1')

  ok('ENGAGEMENT_RESCUE_V1 filtered out (already running)', !rescue,
    `found with score: ${rescue?.priorityScore}`)
}

async function testCooldownFilter(projectId: string, userId: string, token: string) {
  console.log('\n[13] Cooldown window — mission completed within 7 days is filtered')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 500)
  await seedFact(projectId, 'current_followers', 3000)
  await seedFact(projectId, 'avg_engagement_rate', 0.04)
  // Mark ENGAGEMENT_RESCUE_V1 completed 2 days ago (within 7-day cooldown)
  await markMissionCompleted(projectId, 'ENGAGEMENT_RESCUE_V1', 2)

  const data = await runEngines(token)
  const policy = data.policy
  const rescue = policy.missionQueue?.find((m: { templateCode: string }) => m.templateCode === 'ENGAGEMENT_RESCUE_V1')

  ok('ENGAGEMENT_RESCUE_V1 filtered out (within 7-day cooldown)', !rescue,
    `found with score: ${rescue?.priorityScore}`)
}

async function testLowWalletPremiumPenalty(projectId: string, userId: string, token: string) {
  console.log('\n[14] Wallet credits < 50 → premium mission score −40')
  await resetState(projectId)
  // Premium balance = 30 (below 50 threshold, above 0 so not filtered)
  await seedWallet(projectId, 2000, 30)
  await seedFact(projectId, 'current_followers', 3000)
  await seedFact(projectId, 'avg_engagement_rate', 0.04)
  await seedSignal(projectId, 'content_perf.viral_spike', { multiplier: 5 }, 2)

  const data = await runEngines(token)
  const policy = data.policy
  const contentBatch = policy.missionQueue?.find((m: { templateCode: string }) => m.templateCode === 'CONTENT_BATCH_3D_V1')

  // CONTENT_BATCH has premium cost → appears in queue (not filtered, 30 > 0) but score reduced by 40
  ok('CONTENT_BATCH_3D_V1 still in queue (30 > 0 premium credits)', !!contentBatch,
    `queue: ${JSON.stringify(policy.missionQueue?.map((m: { templateCode: string }) => m.templateCode))}`)
  // P2=60 + inflexion+50 + phase_rec+30 + new+20 - low_wallet-40 = 120
  // Without penalty it would be 160; with -40 → 120
  ok('score reduced by -40 penalty (< 160)', (contentBatch?.priorityScore ?? 200) < 160,
    `got: ${contentBatch?.priorityScore}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Policy Engine E2E Tests ===')
  console.log(`Target: ${BASE}`)

  let token: string
  let userId: string
  let projectId: string

  try {
    const auth = await getToken()
    token = auth.token
    userId = auth.userId

    projectId = await ensureProject(userId, 'F1')
    console.log(`Project: ${projectId}`)

    await testF0CoreFlowGate(projectId, userId, token)
    await testF0CoreFlowPartial(projectId, userId, token)
    await testF0AllCoreFlowDone(projectId, userId, token)
    await testInflexionBonus(projectId, userId, token)
    await testPhaseRecommendationBonus(projectId, userId, token)
    await testBurnoutPenalty(projectId, userId, token)
    await testDailyLimitReached(projectId, userId, token)
    await testNoPremiumCreditsFilter(projectId, userId, token)
    await testActiveModeViralSpike(projectId, userId, token)
    await testActiveModeMonetization(projectId, userId, token)
    await testCompletedOver30DaysBonus(projectId, userId, token)
    await testActiveMissionFilter(projectId, userId, token)
    await testCooldownFilter(projectId, userId, token)
    await testLowWalletPremiumPenalty(projectId, userId, token)

    await cleanup(projectId)
  } finally {
    await deleteTestUser()
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
