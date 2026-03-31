// Step 9 production E2E — tests the Inflexion Engine via the live Vercel deployment
// Run: npx tsx --env-file=.env scripts/test-inflexion-engine.ts
//
// Tests each inflexion type by seeding Brain Signals and Facts into Supabase,
// then calling POST /api/engines and verifying the inflexion result.
//
// Inflexion types tested:
//   1a. viral_spike     — content_perf.viral_spike signal in last 72h
//   1b. viral_spike     — post reach 3x above 30d average
//   1c. viral_spike     — follower growth 3x above 30d daily average
//   2. crisis           — negative_sentiment signal in last 72h
//   3. monetization_ready — followers >= 5000 + avg_er >= 3% + no prior signal
//   4. engagement_plateau — no growth + avg_er < 2% for 14d
//   5. burnout_risk     — consistency_gap + declining posts
//   6. null (no inflexion) — clean state → engine returns null
//   7. cooldown         — same inflexion type does not re-fire within 7 days

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

const TEST_EMAIL = `e2e-inflexion-${Date.now()}@glimad-test.dev`
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

async function ensureProject(userId: string): Promise<string> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: proj } = await admin.from('projects')
    .update({ name: 'Inflexion Test', status: 'active', phase_code: 'F3', active_mode: 'test', publishing_mode: 'BUILDING', focus_platform: 'instagram', focus_platform_handle: 'testuser' })
    .eq('user_id', userId)
    .select('id').single()
  if (!proj) throw new Error('Project update failed')

  // Active subscription so middleware passes
  await admin.from('core_subscriptions').insert({
    project_id: proj.id, user_id: userId,
    stripe_customer_id: `cus_test_${Date.now()}`,
    stripe_subscription_id: `sub_test_${Date.now()}`,
    plan_code: 'BASE', status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
  })

  return proj.id
}

async function cleanup(projectId: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  await admin.from('core_inflexion_events').delete().eq('project_id', projectId)
  await admin.from('core_policy_runs').delete().eq('project_id', projectId)
  await admin.from('brain_signals').delete().eq('project_id', projectId)
  await admin.from('brain_facts').delete().eq('project_id', projectId)
  await admin.from('brain_snapshots').delete().eq('project_id', projectId)
  await admin.from('core_phase_runs').delete().eq('project_id', projectId)
  await admin.from('core_subscriptions').delete().eq('project_id', projectId)
  await admin.from('projects').delete().eq('id', projectId)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resetBrain(projectId: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  await admin.from('brain_signals').delete().eq('project_id', projectId)
  await admin.from('brain_facts').delete().eq('project_id', projectId)
  await admin.from('core_inflexion_events').delete().eq('project_id', projectId)
  await admin.from('core_policy_runs').delete().eq('project_id', projectId)
  await admin.from('core_phase_runs').delete().eq('project_id', projectId)
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

async function runEngines(token: string) {
  const res = await fetch(`${BASE}/api/engines`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (res.status !== 200) return null
  return res.json()
}

async function getLatestInflexionEvent(projectId: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data } = await admin.from('core_inflexion_events')
    .select('*').eq('project_id', projectId)
    .order('created_at', { ascending: false }).limit(1).single()
  return data
}

async function countInflexionSignals(projectId: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data } = await admin.from('brain_signals')
    .select('id').eq('project_id', projectId).eq('signal_key', 'inflexion_detected')
  return data?.length ?? 0
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testViralSpike(projectId: string, token: string) {
  console.log('\n[1a] viral_spike — explicit content_perf.viral_spike signal in 72h')
  await resetBrain(projectId)
  await seedFact(projectId, 'current_followers', 1000)
  await seedFact(projectId, 'avg_engagement_rate', 0.04)
  await seedSignal(projectId, 'content_perf.viral_spike', { multiplier: 8, video_id: 'vid_123' }, 2)

  const result = await runEngines(token)
  ok('engines returns 200', !!result, 'null response')
  ok('inflexion type = viral_spike', result?.inflexion?.type === 'viral_spike', `got ${result?.inflexion?.type}`)
  ok('confidence >= 0.5', (result?.inflexion?.confidence ?? 0) >= 0.5, `got ${result?.inflexion?.confidence}`)

  const event = await getLatestInflexionEvent(projectId)
  ok('core_inflexion_events row written', !!event, 'row missing')
  ok('event_key = viral_spike', event?.event_key === 'viral_spike', `got ${event?.event_key}`)
  ok('severity = high', event?.severity === 'high', `got ${event?.severity}`)
  ok('recommended_actions contains VIRAL_RESPONSE_V1', event?.recommended_actions?.includes('VIRAL_RESPONSE_V1'), JSON.stringify(event?.recommended_actions))

  const sigCount = await countInflexionSignals(projectId)
  ok('inflexion_detected signal written', sigCount >= 1, `count=${sigCount}`)
  ok('policy topMission influenced by inflexion', !!result?.policy?.topMission, `topMission=${result?.policy?.topMission}`)

  console.log('\n[1b] viral_spike — post reach 3x above 30d average')
  await resetBrain(projectId)
  await seedFact(projectId, 'current_followers', 1000)
  await seedFact(projectId, 'avg_engagement_rate', 0.04)
  await seedSignal(projectId, 'engagement.avg_post_reach', { value: 500 }, 20 * 24)
  await seedSignal(projectId, 'engagement.post_reach', { value: 1800 }, 3) // 3.6x average

  const result2 = await runEngines(token)
  ok('engines returns 200', !!result2, 'null response')
  ok('reach-based viral_spike detected', result2?.inflexion?.type === 'viral_spike', `got ${result2?.inflexion?.type}`)
  ok('confidence >= 0.8', (result2?.inflexion?.confidence ?? 0) >= 0.8, `got ${result2?.inflexion?.confidence}`)

  console.log('\n[1c] viral_spike — follower growth 3x above 30d daily average')
  await resetBrain(projectId)
  await seedFact(projectId, 'current_followers', 1000)
  await seedFact(projectId, 'avg_engagement_rate', 0.04)
  // 30d baseline: grew from 1000 → 1300 (300 in 30d = 10/day average)
  await seedSignal(projectId, 'growth.followers_total', { value: 1300 }, 1 * 24)   // 24h ago (in 72h window)
  await seedSignal(projectId, 'growth.followers_total', { value: 1000 }, 3 * 24)   // 72h ago (edge of 72h window, also 30d)
  await seedSignal(projectId, 'growth.followers_total', { value: 1000 }, 10 * 24)  // 10d ago (30d window, for baseline)
  await seedSignal(projectId, 'growth.followers_total', { value: 700 }, 30 * 24)   // 30d ago (oldest, baseline start)
  // dailyAvg = (1300 - 700) / 30 = 20/day
  // recentGrowth (72h) = 1300 - 1000 = 300
  // threshold = 20 * 9 = 180 → 300 > 180 ✓

  const result3 = await runEngines(token)
  ok('engines returns 200', !!result3, 'null response')
  ok('growth-based viral_spike detected', result3?.inflexion?.type === 'viral_spike', `got ${result3?.inflexion?.type}`)
  ok('confidence >= 0.7', (result3?.inflexion?.confidence ?? 0) >= 0.7, `got ${result3?.inflexion?.confidence}`)
  ok('evidence has follower_surge', !!(result3?.inflexion?.evidence?.follower_surge), `evidence: ${JSON.stringify(result3?.inflexion?.evidence)}`)
}

async function testCrisis(projectId: string, token: string) {
  console.log('\n[2a] crisis — negative_sentiment signal in 72h')
  await resetBrain(projectId)
  await seedFact(projectId, 'followers_total', 5000)
  await seedFact(projectId, 'avg_engagement_rate', 0.03)
  await seedSignal(projectId, 'negative_sentiment', { reason: 'toxic_comments_spike', severity: 'high' }, 5)

  const result = await runEngines(token)
  ok('engines returns 200', !!result, 'null response')
  ok('inflexion type = crisis', result?.inflexion?.type === 'crisis', `got ${result?.inflexion?.type}`)
  ok('confidence = 0.85 (negative_sentiment)', result?.inflexion?.confidence === 0.85, `got ${result?.inflexion?.confidence}`)

  const event = await getLatestInflexionEvent(projectId)
  ok('core_inflexion_events row written', !!event, 'row missing')
  ok('event_key = crisis', event?.event_key === 'crisis', `got ${event?.event_key}`)
  ok('type = downgrade', event?.type === 'downgrade', `got ${event?.type}`)
  ok('recommended_actions contains CRISIS_RESPONSE_V1', event?.recommended_actions?.includes('CRISIS_RESPONSE_V1'), JSON.stringify(event?.recommended_actions))

  console.log('\n[2b] crisis — rapid follower loss (delta < -100) in 72h')
  await resetBrain(projectId)
  await seedFact(projectId, 'followers_total', 5000)
  await seedFact(projectId, 'avg_engagement_rate', 0.03)
  await seedSignal(projectId, 'growth.followers_total', { value: 4800, delta: -200 }, 12)

  const result2 = await runEngines(token)
  ok('engines returns 200', !!result2, 'null response')
  ok('inflexion type = crisis (follower loss)', result2?.inflexion?.type === 'crisis', `got ${result2?.inflexion?.type}`)
  ok('confidence = 0.70 (follower_loss)', result2?.inflexion?.confidence === 0.70, `got ${result2?.inflexion?.confidence}`)
  ok('evidence.follower_loss = true', result2?.inflexion?.evidence?.follower_loss === true, `got ${result2?.inflexion?.evidence?.follower_loss}`)

  console.log('\n[2c] crisis — high block rate (> 5%) in 72h')
  await resetBrain(projectId)
  await seedFact(projectId, 'followers_total', 5000)
  await seedFact(projectId, 'avg_engagement_rate', 0.03)
  await seedSignal(projectId, 'block_rate', { rate: 0.08 }, 6)

  const result3 = await runEngines(token)
  ok('engines returns 200', !!result3, 'null response')
  ok('inflexion type = crisis (block rate)', result3?.inflexion?.type === 'crisis', `got ${result3?.inflexion?.type}`)
  ok('confidence = 0.80 (high block rate)', result3?.inflexion?.confidence === 0.80, `got ${result3?.inflexion?.confidence}`)
  ok('evidence.high_block_rate = true', result3?.inflexion?.evidence?.high_block_rate === true, `got ${result3?.inflexion?.evidence?.high_block_rate}`)

  console.log('\n[2d] crisis suppressed — follower loss delta = -50 (below threshold)')
  await resetBrain(projectId)
  await seedFact(projectId, 'current_followers', 2000)
  await seedFact(projectId, 'avg_engagement_rate', 0.03)
  await seedSignal(projectId, 'growth.followers_total', { value: 1950, delta: -50 }, 12)

  const result4 = await runEngines(token)
  ok('engines returns 200', !!result4, 'null response')
  ok('crisis NOT triggered for delta=-50', result4?.inflexion?.type !== 'crisis', `got ${result4?.inflexion?.type}`)
}

async function testMonetizationReady(projectId: string, token: string) {
  console.log('\n[3] monetization_ready — current_followers >= 5000 + avg_er >= 3%')
  await resetBrain(projectId)
  await seedFact(projectId, 'current_followers', 7500)
  await seedFact(projectId, 'avg_engagement_rate', 0.045)

  const result = await runEngines(token)
  ok('engines returns 200', !!result, 'null response')
  ok('inflexion type = monetization_ready', result?.inflexion?.type === 'monetization_ready', `got ${result?.inflexion?.type}`)
  ok('confidence = 0.8', result?.inflexion?.confidence === 0.8, `got ${result?.inflexion?.confidence}`)

  const event = await getLatestInflexionEvent(projectId)
  ok('core_inflexion_events row written', !!event, 'row missing')
  ok('type = upgrade', event?.type === 'upgrade', `got ${event?.type}`)
  ok('recommended_actions contains DEFINE_OFFER_V1', event?.recommended_actions?.includes('DEFINE_OFFER_V1'), JSON.stringify(event?.recommended_actions))

  console.log('\n[3b] monetization_ready suppressed — event already in last 90 days')
  // Brain state still meets conditions but event already fired → should suppress
  const result2 = await runEngines(token)
  ok('engines returns 200', !!result2, 'null response')
  ok('monetization_ready suppressed within 90d window', result2?.inflexion?.type !== 'monetization_ready',
    `got: ${result2?.inflexion?.type}`)
}

async function testEngagementPlateau(projectId: string, token: string) {
  console.log('\n[4a] engagement_plateau — no growth (delta=0) + all ER signals < 2% for 14d')
  await resetBrain(projectId)
  await seedFact(projectId, 'followers_total', 1200)
  await seedFact(projectId, 'avg_engagement_rate', 0.015)
  // Seed 5 ER signals across 14d, all below 2%
  for (let i = 1; i <= 5; i++) {
    await seedSignal(projectId, 'engagement.avg_er_7d', { value: 0.015 }, i * 48)
  }
  // Growth signal with delta=0 (no positive change)
  await seedSignal(projectId, 'growth.followers_total', { value: 1200, delta: 0 }, 5 * 24)

  const result = await runEngines(token)
  ok('engines returns 200', !!result, 'null response')
  ok('inflexion type = engagement_plateau', result?.inflexion?.type === 'engagement_plateau', `got ${result?.inflexion?.type}`)
  ok('confidence >= 0.7', (result?.inflexion?.confidence ?? 0) >= 0.7, `got ${result?.inflexion?.confidence}`)

  const event = await getLatestInflexionEvent(projectId)
  ok('core_inflexion_events row written', !!event, 'row missing')
  ok('event_key = engagement_plateau', event?.event_key === 'engagement_plateau', `got ${event?.event_key}`)
  ok('severity = med', event?.severity === 'med', `got ${event?.severity}`)

  console.log('\n[4b] engagement_plateau suppressed — positive delta present')
  await resetBrain(projectId)
  await seedFact(projectId, 'followers_total', 1200)
  await seedFact(projectId, 'avg_engagement_rate', 0.015)
  for (let i = 1; i <= 5; i++) {
    await seedSignal(projectId, 'engagement.avg_er_7d', { value: 0.015 }, i * 48)
  }
  // Positive follower delta → plateau should NOT fire
  await seedSignal(projectId, 'growth.followers_total', { value: 1250, delta: 50 }, 3 * 24)

  const result2 = await runEngines(token)
  ok('engines returns 200', !!result2, 'null response')
  ok('engagement_plateau suppressed when delta > 0', result2?.inflexion?.type !== 'engagement_plateau',
    `got: ${result2?.inflexion?.type}`)

  console.log('\n[4c] engagement_plateau suppressed — ER spikes above 2% mid-window')
  await resetBrain(projectId)
  await seedFact(projectId, 'followers_total', 1200)
  await seedFact(projectId, 'avg_engagement_rate', 0.015)
  // Mix of low and high ER signals → not all < 2% → no plateau
  await seedSignal(projectId, 'engagement.avg_er_7d', { value: 0.015 }, 1 * 48)
  await seedSignal(projectId, 'engagement.avg_er_7d', { value: 0.025 }, 2 * 48) // spike above 2%
  await seedSignal(projectId, 'engagement.avg_er_7d', { value: 0.015 }, 3 * 48)

  const result3 = await runEngines(token)
  ok('engines returns 200', !!result3, 'null response')
  ok('engagement_plateau suppressed when any ER ≥ 2%', result3?.inflexion?.type !== 'engagement_plateau',
    `got: ${result3?.inflexion?.type}`)
}

async function testBurnoutRisk(projectId: string, token: string) {
  console.log('\n[5] burnout_risk — consistency_gap + declining posts')
  await resetBrain(projectId)
  await seedFact(projectId, 'followers_total', 800)
  await seedFact(projectId, 'avg_engagement_rate', 0.03)
  await seedSignal(projectId, 'consistency_gap', { days_since_last_post: 6 }, 2)
  // Monthly pace was 12 posts, recent week only 1
  await seedSignal(projectId, 'consistency.posts_published_30d', { value: 12 }, 5 * 24)
  await seedSignal(projectId, 'consistency.posts_published_30d', { value: 11 }, 10 * 24)
  await seedSignal(projectId, 'consistency.posts_published_7d', { value: 1 }, 3 * 24)

  const result = await runEngines(token)
  ok('engines returns 200', !!result, 'null response')
  ok('inflexion type = burnout_risk', result?.inflexion?.type === 'burnout_risk', `got ${result?.inflexion?.type}`)
  ok('confidence >= 0.6', (result?.inflexion?.confidence ?? 0) >= 0.6, `got ${result?.inflexion?.confidence}`)

  const event = await getLatestInflexionEvent(projectId)
  ok('core_inflexion_events row written', !!event, 'row missing')
  ok('event_key = burnout_risk', event?.event_key === 'burnout_risk', `got ${event?.event_key}`)
  ok('type = downgrade', event?.type === 'downgrade', `got ${event?.type}`)
}

async function testNoInflexion(projectId: string, token: string) {
  console.log('\n[6] null (no inflexion) — clean state')
  await resetBrain(projectId)
  // Low followers (< 5000 → no monetization_ready)
  // avg_er > 2% → no engagement_plateau
  // No negative signals → no crisis
  // No consistency_gap → no burnout_risk
  // No viral signals → no viral_spike
  await seedFact(projectId, 'followers_total', 500)
  await seedFact(projectId, 'avg_engagement_rate', 0.025)

  const result = await runEngines(token)
  ok('engines returns 200', !!result, 'null response')
  ok('inflexion = null (no event)', result?.inflexion === null, `got type=${result?.inflexion?.type}`)

  const sigCount = await countInflexionSignals(projectId)
  ok('no inflexion_detected signal written', sigCount === 0, `count=${sigCount}`)
}

async function testCooldown(projectId: string, token: string) {
  console.log('\n[7] cooldown — 7-day guard: viral_spike does not re-write signal/event within 7 days')
  await resetBrain(projectId)
  await seedFact(projectId, 'current_followers', 1000)
  await seedFact(projectId, 'avg_engagement_rate', 0.04)
  // Keep the viral spike signal alive across both calls
  await seedSignal(projectId, 'content_perf.viral_spike', { multiplier: 6 }, 2)

  // First call — should fire and write event + signal
  const result1 = await runEngines(token)
  ok('first call inflexion detected', result1?.inflexion?.type === 'viral_spike', `got ${result1?.inflexion?.type}`)

  const sigCount1 = await countInflexionSignals(projectId)
  ok('signal written on first call', sigCount1 === 1, `count=${sigCount1}`)

  // Second call — 7-day cooldown in runInflexionEngine should prevent re-writing
  const result2 = await runEngines(token)
  ok('second call still returns inflexion result (passed through)', result2?.inflexion?.type === 'viral_spike', `got ${result2?.inflexion?.type}`)

  const sigCount2 = await countInflexionSignals(projectId)
  ok('no duplicate signal on second call', sigCount2 === 1, `count=${sigCount2}`)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: events } = await admin.from('core_inflexion_events')
    .select('id').eq('project_id', projectId).eq('event_key', 'viral_spike')
  ok('only 1 core_inflexion_events row (no duplicate)', (events?.length ?? 0) === 1, `count=${events?.length}`)
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Inflexion Engine E2E Test (Step 9) ===')
  console.log(`Target: ${BASE}\n`)

  const { token, userId } = await getToken()
  console.log(`Authenticated as: ${TEST_EMAIL} (${userId})`)

  const projectId = await ensureProject(userId)
  console.log(`Project: ${projectId}\n`)

  try {
    await testViralSpike(projectId, token)
    await testCrisis(projectId, token)
    await testMonetizationReady(projectId, token)
    await testEngagementPlateau(projectId, token)
    await testBurnoutRisk(projectId, token)
    await testNoInflexion(projectId, token)
    await testCooldown(projectId, token)
  } catch (err) {
    console.error('\nFATAL:', (err as Error).message)
    failed++
  } finally {
    console.log('\nCleaning up...')
    await cleanup(projectId)
    await deleteTestUser()
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main()
