// Step 9 production E2E — tests the Inflexion Engine via the live Vercel deployment
// Run: npx tsx --env-file=.env scripts/test-inflexion-engine.ts
//
// Tests each inflexion type by seeding Brain Signals and Facts into Supabase,
// then calling POST /api/engines and verifying the inflexion result.
//
// Inflexion types tested:
//   1. viral_spike      — content_perf.viral_spike signal in last 72h
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
  console.log('\n[1] viral_spike — content_perf.viral_spike signal in 72h')
  await resetBrain(projectId)
  await seedFact(projectId, 'followers_total', 1000)
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
}

async function testCrisis(projectId: string, token: string) {
  console.log('\n[2] crisis — negative_sentiment signal in 72h')
  await resetBrain(projectId)
  await seedFact(projectId, 'followers_total', 5000)
  await seedFact(projectId, 'avg_engagement_rate', 0.03)
  await seedSignal(projectId, 'negative_sentiment', { reason: 'toxic_comments_spike', severity: 'high' }, 5)

  const result = await runEngines(token)
  ok('engines returns 200', !!result, 'null response')
  ok('inflexion type = crisis', result?.inflexion?.type === 'crisis', `got ${result?.inflexion?.type}`)
  ok('confidence >= 0.7', (result?.inflexion?.confidence ?? 0) >= 0.7, `got ${result?.inflexion?.confidence}`)

  const event = await getLatestInflexionEvent(projectId)
  ok('core_inflexion_events row written', !!event, 'row missing')
  ok('event_key = crisis', event?.event_key === 'crisis', `got ${event?.event_key}`)
  ok('type = downgrade', event?.type === 'downgrade', `got ${event?.type}`)
  ok('recommended_actions contains CRISIS_RESPONSE_V1', event?.recommended_actions?.includes('CRISIS_RESPONSE_V1'), JSON.stringify(event?.recommended_actions))
}

async function testMonetizationReady(projectId: string, token: string) {
  console.log('\n[3] monetization_ready — followers >= 5000 + avg_er >= 3%')
  await resetBrain(projectId)
  await seedFact(projectId, 'followers_total', 7500)
  await seedFact(projectId, 'avg_engagement_rate', 0.045)

  const result = await runEngines(token)
  ok('engines returns 200', !!result, 'null response')
  ok('inflexion type = monetization_ready', result?.inflexion?.type === 'monetization_ready', `got ${result?.inflexion?.type}`)
  ok('confidence = 0.8', result?.inflexion?.confidence === 0.8, `got ${result?.inflexion?.confidence}`)

  const event = await getLatestInflexionEvent(projectId)
  ok('core_inflexion_events row written', !!event, 'row missing')
  ok('type = upgrade', event?.type === 'upgrade', `got ${event?.type}`)
  ok('recommended_actions contains DEFINE_OFFER_V1', event?.recommended_actions?.includes('DEFINE_OFFER_V1'), JSON.stringify(event?.recommended_actions))
}

async function testEngagementPlateau(projectId: string, token: string) {
  console.log('\n[4] engagement_plateau — no growth + avg_er < 2% for 14d')
  await resetBrain(projectId)
  await seedFact(projectId, 'followers_total', 1200)
  await seedFact(projectId, 'avg_engagement_rate', 0.015)
  // Seed engagement signals over last 14d with low ER (no positive growth signals)
  for (let i = 1; i <= 5; i++) {
    await seedSignal(projectId, 'engagement.avg_er_7d', { value: 0.015 }, i * 48)
  }

  const result = await runEngines(token)
  ok('engines returns 200', !!result, 'null response')
  ok('inflexion type = engagement_plateau', result?.inflexion?.type === 'engagement_plateau', `got ${result?.inflexion?.type}`)
  ok('confidence >= 0.7', (result?.inflexion?.confidence ?? 0) >= 0.7, `got ${result?.inflexion?.confidence}`)

  const event = await getLatestInflexionEvent(projectId)
  ok('core_inflexion_events row written', !!event, 'row missing')
  ok('event_key = engagement_plateau', event?.event_key === 'engagement_plateau', `got ${event?.event_key}`)
  ok('severity = med', event?.severity === 'med', `got ${event?.severity}`)
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
  await seedFact(projectId, 'followers_total', 500)
  await seedFact(projectId, 'avg_engagement_rate', 0.025)
  // Some normal growth signals
  await seedSignal(projectId, 'growth.followers_total', { value: 510 }, 48)
  await seedSignal(projectId, 'growth.followers_total', { value: 500 }, 72)

  const result = await runEngines(token)
  ok('engines returns 200', !!result, 'null response')
  ok('inflexion = null (no event)', result?.inflexion === null, `got type=${result?.inflexion?.type}`)

  const sigCount = await countInflexionSignals(projectId)
  ok('no inflexion_detected signal written', sigCount === 0, `count=${sigCount}`)
}

async function testCooldown(projectId: string, token: string) {
  console.log('\n[7] cooldown — same inflexion does not re-fire within 7 days')
  await resetBrain(projectId)
  await seedFact(projectId, 'followers_total', 7500)
  await seedFact(projectId, 'avg_engagement_rate', 0.045)

  // First call — should fire and write event
  const result1 = await runEngines(token)
  ok('first call inflexion detected', result1?.inflexion?.type === 'monetization_ready', `got ${result1?.inflexion?.type}`)

  const sigCount1 = await countInflexionSignals(projectId)
  ok('signal written on first call', sigCount1 === 1, `count=${sigCount1}`)

  // Second call — cooldown should prevent re-writing signal/event
  const result2 = await runEngines(token)
  ok('second call still returns inflexion result', result2?.inflexion?.type === 'monetization_ready', `got ${result2?.inflexion?.type}`)

  const sigCount2 = await countInflexionSignals(projectId)
  ok('no duplicate signal on second call', sigCount2 === 1, `count=${sigCount2}`)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: events } = await admin.from('core_inflexion_events')
    .select('id').eq('project_id', projectId).eq('event_key', 'monetization_ready')
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
