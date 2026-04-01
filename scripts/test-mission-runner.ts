// Step 11 production E2E — tests the Mission Runner via live Vercel deployment
// Run: npx tsx --env-file=.env scripts/test-mission-runner.ts
//
// Tests every code path in lib/missions/runner.ts:
//   1.  Happy path — start NICHE_CONFIRM_V1 → pause at user_input → respond → completed
//   2.  Idempotency — double start returns same instance_id
//   3.  Insufficient wallet → mission instantly fails
//   4.  brain_update — facts & signals written after respond
//   5.  Ledger debit — correct positive amount_allowance after completion
//   6.  Wallet balance decremented after completion
//   7.  write_outputs — CONTENT_BATCH_3D_V1 saves core_outputs before user_input
//   8.  mission_instances.outputs populated on completion
//   9.  brainContext reconstruction — resumed mission has LLM output available
//  10.  mission_completed signal emitted after completion

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

const TEST_EMAIL = `e2e-runner-${Date.now()}@glimad-test.dev`
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

// ── Project / DB helpers ──────────────────────────────────────────────────────

async function ensureProject(userId: string): Promise<string> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: proj } = await admin
    .from('projects')
    .update({ name: 'Runner Test', status: 'active', phase_code: 'F1', active_mode: 'test', publishing_mode: 'BUILDING', focus_platform: 'instagram', focus_platform_handle: 'testuser' })
    .eq('user_id', userId)
    .select('id').single()
  if (!proj) throw new Error('Project update failed')

  await admin.from('core_subscriptions').upsert({
    project_id: proj.id, user_id: userId,
    stripe_customer_id: `cus_runner_${Date.now()}`,
    stripe_subscription_id: `sub_runner_${Date.now()}`,
    plan_code: 'BASE', status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
  }, { onConflict: 'stripe_subscription_id' })

  return proj.id
}

async function seedWallet(projectId: string, allowance: number, premium: number) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  await admin.from('core_wallets').upsert({
    project_id: projectId,
    plan_code: 'BASE',
    allowance_llm_balance: allowance,
    credits_allowance: allowance,
    premium_credits_balance: premium,
    premium_daily_cap_remaining: premium,
    allowance_reset_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    premium_reset_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    status: 'active',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id' })
}

async function seedFact(projectId: string, key: string, value: unknown) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  await admin.from('brain_facts').upsert(
    { project_id: projectId, fact_key: key, value, source: 'test', updated_at: new Date().toISOString() },
    { onConflict: 'project_id,fact_key' }
  )
}

async function resetState(projectId: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  await admin.from('core_outputs').delete().eq('project_id', projectId)
  await admin.from('mission_steps').delete().in(
    'mission_instance_id',
    (await admin.from('mission_instances').select('id').eq('project_id', projectId)).data?.map(r => r.id) ?? []
  )
  await admin.from('mission_instances').delete().eq('project_id', projectId)
  await admin.from('brain_signals').delete().eq('project_id', projectId)
  await admin.from('brain_facts').delete().eq('project_id', projectId)
  await admin.from('core_ledger').delete().eq('project_id', projectId)
}

async function cleanup(projectId: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  await resetState(projectId)
  await admin.from('core_wallets').delete().eq('project_id', projectId)
  await admin.from('core_subscriptions').delete().eq('project_id', projectId)
  await admin.from('projects').delete().eq('id', projectId)
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function startMission(token: string, templateCode: string): Promise<{ instance_id: string }> {
  const res = await fetch(`${BASE}/api/missions/start`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_code: templateCode }),
  })
  return res.json()
}

async function getMission(token: string, instanceId: string) {
  const res = await fetch(`${BASE}/api/missions/${instanceId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  return res.json()
}

async function respondMission(token: string, instanceId: string, inputs: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/missions/${instanceId}/respond`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs),
  })
  return res.json()
}

// Poll until status matches or timeout
async function pollUntilStatus(
  token: string,
  instanceId: string,
  targetStatus: string,
  maxWaitMs = 60000
): Promise<{ instance: Record<string, unknown>; steps: Record<string, unknown>[] }> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 2000))
    const data = await getMission(token, instanceId)
    if (data?.instance?.status === targetStatus) return data
    if (data?.instance?.status === 'failed') return data
  }
  const data = await getMission(token, instanceId)
  return data
}

// ── Test Groups ───────────────────────────────────────────────────────────────

async function testHappyPath(projectId: string, token: string) {
  console.log('\n[1] Happy path — start NICHE_CONFIRM_V1 → waiting_input → respond → completed')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)
  await seedFact(projectId, 'niche_raw', 'fitness for moms')
  await seedFact(projectId, 'primary_goal', 'build audience')

  const { instance_id } = await startMission(token, 'NICHE_CONFIRM_V1')
  ok('instance_id returned', !!instance_id)

  // Wait for waiting_input (LLM runs steps 1+2, pauses at step 3)
  const pausedData = await pollUntilStatus(token, instance_id, 'waiting_input', 45000)
  ok('status = waiting_input', pausedData?.instance?.status === 'waiting_input',
    `got: ${pausedData?.instance?.status}`)

  // Verify at least 2 steps completed (brain_read + llm_text)
  ok('steps 1+2 completed',
    (pausedData?.steps as Record<string, unknown>[])?.filter(s => s['status'] === 'completed').length >= 2)

  // Respond with user inputs
  await respondMission(token, instance_id, {
    niche_confirmed: 'Fitness para mamás ocupadas',
    audience_persona: 'Mamás de 30-45 años con poco tiempo',
    positioning_statement: 'Rutinas de 15 min que caben en tu vida',
  })

  // Poll until completed
  const doneData = await pollUntilStatus(token, instance_id, 'completed', 30000)
  ok('status = completed', doneData?.instance?.status === 'completed',
    `got: ${doneData?.instance?.status}`)
}

async function testIdempotency(projectId: string, token: string) {
  console.log('\n[2] Idempotency — double start returns same instance_id')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)

  const r1 = await startMission(token, 'NICHE_CONFIRM_V1')
  const r2 = await startMission(token, 'NICHE_CONFIRM_V1')
  ok('same instance_id on double start', r1.instance_id === r2.instance_id,
    `r1=${r1.instance_id} r2=${r2.instance_id}`)
}

async function testInsufficientWallet(projectId: string, token: string) {
  console.log('\n[3] Insufficient wallet → mission instantly fails')
  await resetState(projectId)
  await seedWallet(projectId, 0, 0) // 0 allowance, NICHE_CONFIRM_V1 costs 5

  const { instance_id } = await startMission(token, 'NICHE_CONFIRM_V1')
  const data = await pollUntilStatus(token, instance_id, 'failed', 15000)
  ok('status = failed', data?.instance?.status === 'failed',
    `got: ${data?.instance?.status}`)
}

async function testBrainUpdate(projectId: string, token: string) {
  console.log('\n[4] brain_update — facts & signals written after respond')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)
  await seedFact(projectId, 'niche_raw', 'travel photography')
  await seedFact(projectId, 'primary_goal', 'monetize')

  const { instance_id } = await startMission(token, 'NICHE_CONFIRM_V1')
  await pollUntilStatus(token, instance_id, 'waiting_input', 45000)

  await respondMission(token, instance_id, {
    niche_confirmed: 'Fotografía de viajes',
    audience_persona: 'Millennials viajeros',
    positioning_statement: 'Fotografías que cuentan historias',
  })

  await pollUntilStatus(token, instance_id, 'completed', 30000)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: facts } = await admin.from('brain_facts')
    .select('fact_key, value')
    .eq('project_id', projectId)
    .in('fact_key', ['niche_confirmed', 'audience_persona', 'positioning'])

  const factMap = Object.fromEntries((facts ?? []).map(f => [f.fact_key, f.value]))
  ok('niche_confirmed fact saved', factMap['niche_confirmed'] === 'Fotografía de viajes')
  ok('audience_persona fact saved', factMap['audience_persona'] === 'Millennials viajeros')

  const { data: signals } = await admin.from('brain_signals')
    .select('signal_key')
    .eq('project_id', projectId)
    .eq('signal_key', 'niche_confirmed')
  ok('niche_confirmed signal emitted', (signals?.length ?? 0) > 0)
}

async function testLedgerDebit(projectId: string, token: string) {
  console.log('\n[5] Ledger debit — positive amount_allowance after completion')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)

  const { instance_id } = await startMission(token, 'NICHE_CONFIRM_V1')
  await pollUntilStatus(token, instance_id, 'waiting_input', 45000)
  await respondMission(token, instance_id, {
    niche_confirmed: 'Test niche',
    audience_persona: 'Test audience',
    positioning_statement: 'Test positioning',
  })
  await pollUntilStatus(token, instance_id, 'completed', 30000)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: ledger } = await admin.from('core_ledger')
    .select('amount_allowance, reason_key')
    .eq('project_id', projectId)
    .eq('reason_key', 'MISSION_ALLOWANCE_DEBIT')
    .eq('idempotency_key', `mission:${instance_id}:allowance_debit`)

  ok('ledger debit row exists', (ledger?.length ?? 0) > 0)
  ok('amount_allowance is positive', (ledger?.[0]?.amount_allowance ?? 0) > 0,
    `got: ${ledger?.[0]?.amount_allowance}`)
  ok('amount_allowance = 5 (NICHE_CONFIRM_V1 cost)', ledger?.[0]?.amount_allowance === 5,
    `got: ${ledger?.[0]?.amount_allowance}`)
}

async function testWalletDecrement(projectId: string, token: string) {
  console.log('\n[6] Wallet balance decremented after completion')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)

  const { instance_id } = await startMission(token, 'NICHE_CONFIRM_V1')
  await pollUntilStatus(token, instance_id, 'waiting_input', 45000)
  await respondMission(token, instance_id, {
    niche_confirmed: 'Yoga online',
    audience_persona: 'Personas estresadas',
    positioning_statement: 'Paz en 10 minutos',
  })
  await pollUntilStatus(token, instance_id, 'completed', 30000)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: wallet } = await admin.from('core_wallets')
    .select('allowance_llm_balance')
    .eq('project_id', projectId)
    .single()

  ok('wallet balance = 2000 - 5 = 1995', wallet?.allowance_llm_balance === 1995,
    `got: ${wallet?.allowance_llm_balance}`)
}

async function testWriteOutputs(projectId: string, token: string) {
  console.log('\n[7] write_outputs — CONTENT_BATCH_3D_V1 saves core_outputs before user_input')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 200) // needs premium for CONTENT_BATCH (50 premium)
  await seedFact(projectId, 'niche', 'fitness para mamás')
  await seedFact(projectId, 'focus_platform', 'instagram')
  await seedFact(projectId, 'audience_persona', 'Mamás 30-45')

  const { instance_id } = await startMission(token, 'CONTENT_BATCH_3D_V1')
  // Waits at user_input (step 4), after write_outputs (step 3) ran
  const pausedData = await pollUntilStatus(token, instance_id, 'waiting_input', 90000)
  ok('status = waiting_input', pausedData?.instance?.status === 'waiting_input',
    `got: ${pausedData?.instance?.status}`)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: outputs } = await admin.from('core_outputs')
    .select('id, output_type, format, status, mission_instance_id')
    .eq('project_id', projectId)
    .eq('mission_instance_id', instance_id)

  ok('core_outputs rows created', (outputs?.length ?? 0) > 0,
    `count: ${outputs?.length}`)
  ok('output_type = content', outputs?.[0]?.output_type === 'content')
  ok('status = draft', outputs?.[0]?.status === 'draft')
  ok('mission_instance_id linked', outputs?.[0]?.mission_instance_id === instance_id)
}

async function testOutputsOnInstance(projectId: string, token: string) {
  console.log('\n[8] mission_instances.outputs populated on completion')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)
  await seedFact(projectId, 'niche_raw', 'cocina saludable')
  await seedFact(projectId, 'primary_goal', 'build audience')

  const { instance_id } = await startMission(token, 'NICHE_CONFIRM_V1')
  await pollUntilStatus(token, instance_id, 'waiting_input', 45000)
  await respondMission(token, instance_id, {
    niche_confirmed: 'Cocina saludable rápida',
    audience_persona: 'Adultos ocupados',
    positioning_statement: 'Recetas de 20 min o menos',
  })
  const doneData = await pollUntilStatus(token, instance_id, 'completed', 30000)

  ok('outputs field populated on instance',
    doneData?.instance?.outputs !== null && doneData?.instance?.outputs !== undefined,
    `outputs: ${JSON.stringify(doneData?.instance?.outputs)}`)
}

async function testMissionCompletedSignal(projectId: string, token: string) {
  console.log('\n[9] mission_completed signal emitted after completion')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)
  await seedFact(projectId, 'niche_raw', 'emprendimiento digital')

  const { instance_id } = await startMission(token, 'NICHE_CONFIRM_V1')
  await pollUntilStatus(token, instance_id, 'waiting_input', 45000)
  await respondMission(token, instance_id, {
    niche_confirmed: 'Emprendimiento digital',
    audience_persona: 'Emprendedores 25-40',
    positioning_statement: 'De idea a negocio en 90 días',
  })
  await pollUntilStatus(token, instance_id, 'completed', 30000)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: signals } = await admin.from('brain_signals')
    .select('signal_key, value')
    .eq('project_id', projectId)
    .eq('signal_key', 'mission_completed')

  ok('mission_completed signal emitted', (signals?.length ?? 0) > 0)
  const sigVal = signals?.[0]?.value as Record<string, unknown>
  ok('signal has template_code', sigVal?.['template_code'] === 'NICHE_CONFIRM_V1')
  ok('signal has instance_id', sigVal?.['instance_id'] === instance_id)
}

async function testStepLogs(projectId: string, token: string) {
  console.log('\n[10] Step logs — all steps recorded in mission_steps')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)
  await seedFact(projectId, 'niche_raw', 'marketing digital')

  const { instance_id } = await startMission(token, 'NICHE_CONFIRM_V1')
  await pollUntilStatus(token, instance_id, 'waiting_input', 45000)
  await respondMission(token, instance_id, {
    niche_confirmed: 'Marketing digital',
    audience_persona: 'PyMEs latinoamericanas',
    positioning_statement: 'ROI medible desde el mes 1',
  })
  const doneData = await pollUntilStatus(token, instance_id, 'completed', 30000)

  const steps = (doneData?.steps as Record<string, unknown>[]) ?? []
  ok('5 steps total', steps.length === 5, `got: ${steps.length}`)
  ok('all steps completed', steps.every(s => s['status'] === 'completed'),
    `statuses: ${steps.map(s => s['status']).join(', ')}`)
  ok('step 1 is brain_read', steps[0]?.['step_type'] === 'brain_read')
  ok('step 2 is llm_text', steps[1]?.['step_type'] === 'llm_text')
  ok('step 3 is user_input', steps[2]?.['step_type'] === 'user_input')
  ok('step 4 is brain_update', steps[3]?.['step_type'] === 'brain_update')
  ok('step 5 is finalize', steps[4]?.['step_type'] === 'finalize')
  ok('llm_text step has output', !!steps[1]?.['output'])
  ok('user_input step has output', !!steps[2]?.['output'])
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Step 11 Mission Runner E2E ===')
  console.log(`Target: ${BASE}`)
  console.log('NOTE: LLM calls are real — tests may take 60-90s per group\n')

  const { token, userId } = await getToken()
  const projectId = await ensureProject(userId)
  console.log(`Test project: ${projectId}`)

  await testHappyPath(projectId, token)
  await testIdempotency(projectId, token)
  await testInsufficientWallet(projectId, token)
  await testBrainUpdate(projectId, token)
  await testLedgerDebit(projectId, token)
  await testWalletDecrement(projectId, token)
  await testWriteOutputs(projectId, token)
  await testOutputsOnInstance(projectId, token)
  await testMissionCompletedSignal(projectId, token)
  await testStepLogs(projectId, token)

  console.log(`\n=== ${passed + failed} assertions: ${passed} passed, ${failed} failed ===`)

  await cleanup(projectId)
  await deleteTestUser()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
