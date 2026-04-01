// Step 11 Mission Runner E2E — tests the runner directly via Supabase admin client
// Run: npx tsx --env-file=.env scripts/test-mission-runner.ts
//
// Calls runner functions directly (bypasses Vercel) — no HTTP timeout constraints.
// Validates every code path in lib/missions/runner.ts against live DB + Claude API.
//
// Test groups:
//   1.  Happy path — NICHE_CONFIRM_V1 pauses at user_input, responds, completes
//   2.  Idempotency — createMissionInstance returns same id when one is already open
//   3.  Insufficient wallet → executeMission marks instance as failed
//   4.  brain_update — facts & signals written after resume
//   5.  Ledger debit — positive amount_allowance after completion
//   6.  Wallet balance decremented after completion
//   7.  write_outputs — CONTENT_BATCH_3D_V1 saves core_outputs rows
//   8.  mission_instances.outputs populated on completion
//   9.  mission_completed signal emitted after completion
//  10.  Step logs — all steps recorded in mission_steps

import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '../lib/supabase/admin'
import { createMissionInstance, executeMission, resumeMissionAfterInput } from '../lib/missions/runner'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let passed = 0
let failed = 0

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${label}`); passed++ }
  else { console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++ }
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

// ── Auth + project setup ──────────────────────────────────────────────────────

const TEST_EMAIL = `e2e-runner-${Date.now()}@glimad-test.dev`
const TEST_PASSWORD = 'E2eTestPass123!'
let testUserId: string | null = null

async function getTestUser(): Promise<string> {
  const { data: created, error } = await sb().auth.admin.createUser({
    email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true,
  })
  if (error || !created.user) throw new Error(`User creation failed: ${error?.message}`)
  testUserId = created.user.id
  return created.user.id
}

async function deleteTestUser() {
  if (!testUserId) return
  await sb().auth.admin.deleteUser(testUserId)
}

async function ensureProject(userId: string): Promise<string> {
  const { data: proj } = await sb()
    .from('projects')
    .update({ name: 'Runner Test', status: 'active', phase_code: 'F1', active_mode: 'test', publishing_mode: 'BUILDING', focus_platform: 'instagram', focus_platform_handle: 'testuser' })
    .eq('user_id', userId)
    .select('id').single()
  if (!proj) throw new Error('Project update failed')

  await sb().from('core_subscriptions').upsert({
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
  await sb().from('core_wallets').upsert({
    project_id: projectId, plan_code: 'BASE',
    allowance_llm_balance: allowance, credits_allowance: allowance,
    premium_credits_balance: premium, premium_daily_cap_remaining: premium,
    allowance_reset_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    premium_reset_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    status: 'active', updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id' })
}

async function seedFact(projectId: string, key: string, value: unknown) {
  await sb().from('brain_facts').upsert(
    { project_id: projectId, fact_key: key, value, source: 'test', updated_at: new Date().toISOString() },
    { onConflict: 'project_id,fact_key' }
  )
}

async function resetState(projectId: string) {
  const { data: instances } = await sb().from('mission_instances').select('id').eq('project_id', projectId)
  const ids = (instances ?? []).map((r: { id: string }) => r.id)
  if (ids.length > 0) {
    await sb().from('mission_steps').delete().in('mission_instance_id', ids)
    await sb().from('core_outputs').delete().in('mission_instance_id', ids)
  }
  await sb().from('mission_instances').delete().eq('project_id', projectId)
  await sb().from('brain_signals').delete().eq('project_id', projectId)
  await sb().from('brain_facts').delete().eq('project_id', projectId)
  await sb().from('core_ledger').delete().eq('project_id', projectId)
}

async function cleanup(projectId: string) {
  await resetState(projectId)
  await sb().from('core_wallets').delete().eq('project_id', projectId)
  await sb().from('core_subscriptions').delete().eq('project_id', projectId)
  await sb().from('projects').delete().eq('id', projectId)
}

// ── Test Groups ───────────────────────────────────────────────────────────────

async function testHappyPath(projectId: string) {
  console.log('\n[1] Happy path — NICHE_CONFIRM_V1 pauses at user_input, responds, completes')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)
  await seedFact(projectId, 'niche_raw', 'fitness para mamás')
  await seedFact(projectId, 'primary_goal', 'build audience')

  const admin = createAdminClient()
  const instanceId = await createMissionInstance(admin, projectId, 'NICHE_CONFIRM_V1')
  ok('instance_id returned', !!instanceId)

  await executeMission(admin, instanceId)

  const { data: inst1 } = await sb().from('mission_instances').select('status, current_step').eq('id', instanceId).single()
  ok('status = waiting_input', inst1?.status === 'waiting_input', `got: ${inst1?.status}`)

  const { data: steps1 } = await sb().from('mission_steps').select('step_number, status').eq('mission_instance_id', instanceId).order('step_number')
  const completed1 = (steps1 ?? []).filter((s: { status: string }) => s.status === 'completed')
  ok('steps 1+2 completed before pause', completed1.length >= 2, `completed: ${completed1.length}`)

  await resumeMissionAfterInput(admin, instanceId, {
    niche: 'Fitness para mamás ocupadas',
    audience_persona: 'Mamás de 30-45 años con poco tiempo',
    positioning: 'Rutinas de 15 min que caben en tu vida',
  })

  const { data: inst2 } = await sb().from('mission_instances').select('status').eq('id', instanceId).single()
  ok('status = completed after resume', inst2?.status === 'completed', `got: ${inst2?.status}`)
}

async function testIdempotency(projectId: string) {
  console.log('\n[2] Idempotency — createMissionInstance returns same id when open instance exists')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)

  const admin = createAdminClient()
  const id1 = await createMissionInstance(admin, projectId, 'NICHE_CONFIRM_V1')
  const id2 = await createMissionInstance(admin, projectId, 'NICHE_CONFIRM_V1')
  ok('same instance_id returned', id1 === id2, `id1=${id1} id2=${id2}`)
}

async function testInsufficientWallet(projectId: string) {
  console.log('\n[3] Insufficient wallet → executeMission marks instance as failed')
  await resetState(projectId)
  await seedWallet(projectId, 0, 0)

  const admin = createAdminClient()
  const instanceId = await createMissionInstance(admin, projectId, 'NICHE_CONFIRM_V1')
  await executeMission(admin, instanceId)

  const { data: inst } = await sb().from('mission_instances').select('status').eq('id', instanceId).single()
  ok('status = failed', inst?.status === 'failed', `got: ${inst?.status}`)
}

async function testBrainUpdate(projectId: string) {
  console.log('\n[4] brain_update — facts & signals written after resume')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)
  await seedFact(projectId, 'niche_raw', 'travel photography')
  await seedFact(projectId, 'primary_goal', 'monetize')

  const admin = createAdminClient()
  const instanceId = await createMissionInstance(admin, projectId, 'NICHE_CONFIRM_V1')
  await executeMission(admin, instanceId)
  await resumeMissionAfterInput(admin, instanceId, {
    niche: 'Fotografía de viajes',
    audience_persona: 'Millennials viajeros',
    positioning: 'Fotografías que cuentan historias',
  })

  const { data: facts } = await sb().from('brain_facts')
    .select('fact_key, value').eq('project_id', projectId)
    .in('fact_key', ['audience_persona', 'positioning'])

  const factMap = Object.fromEntries((facts ?? []).map((f: { fact_key: string; value: unknown }) => [f.fact_key, f.value]))
  ok('audience_persona fact saved (user input)', factMap['audience_persona'] === 'Millennials viajeros',
    `got: ${JSON.stringify(factMap['audience_persona'])}`)
  ok('positioning fact saved (user input)', factMap['positioning'] === 'Fotografías que cuentan historias',
    `got: ${JSON.stringify(factMap['positioning'])}`)

  const { data: signals } = await sb().from('brain_signals')
    .select('signal_key').eq('project_id', projectId).eq('signal_key', 'niche_confirmed')
  ok('niche_confirmed signal emitted', (signals?.length ?? 0) > 0)
}

async function testLedgerDebit(projectId: string) {
  console.log('\n[5] Ledger debit — positive amount_allowance after completion')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)

  const admin = createAdminClient()
  const instanceId = await createMissionInstance(admin, projectId, 'NICHE_CONFIRM_V1')
  await executeMission(admin, instanceId)
  await resumeMissionAfterInput(admin, instanceId, {
    niche: 'Test niche',
    audience_persona: 'Test audience',
    positioning: 'Test positioning',
  })

  const { data: ledger } = await sb().from('core_ledger')
    .select('amount_allowance, reason_key')
    .eq('project_id', projectId)
    .eq('reason_key', 'MISSION_ALLOWANCE_DEBIT')
    .eq('idempotency_key', `mission:${instanceId}:allowance_debit`)

  ok('ledger debit row exists', (ledger?.length ?? 0) > 0)
  ok('amount_allowance is positive', (ledger?.[0]?.amount_allowance ?? 0) > 0,
    `got: ${ledger?.[0]?.amount_allowance}`)
  ok('amount_allowance = 5', ledger?.[0]?.amount_allowance === 5,
    `got: ${ledger?.[0]?.amount_allowance}`)
}

async function testWalletDecrement(projectId: string) {
  console.log('\n[6] Wallet balance decremented after completion')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)

  const admin = createAdminClient()
  const instanceId = await createMissionInstance(admin, projectId, 'NICHE_CONFIRM_V1')
  await executeMission(admin, instanceId)
  await resumeMissionAfterInput(admin, instanceId, {
    niche: 'Yoga online',
    audience_persona: 'Personas estresadas',
    positioning: 'Paz en 10 minutos',
  })

  const { data: wallet } = await sb().from('core_wallets')
    .select('allowance_llm_balance').eq('project_id', projectId).single()
  ok('wallet balance = 2000 - 5 = 1995', wallet?.allowance_llm_balance === 1995,
    `got: ${wallet?.allowance_llm_balance}`)
}

async function testWriteOutputs(projectId: string) {
  console.log('\n[7] write_outputs — CONTENT_BATCH_3D_V1 saves core_outputs rows')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 200)
  await seedFact(projectId, 'niche', 'fitness para mamás')
  await seedFact(projectId, 'focus_platform', 'instagram')
  await seedFact(projectId, 'audience_persona', 'Mamás 30-45')

  const admin = createAdminClient()
  const instanceId = await createMissionInstance(admin, projectId, 'CONTENT_BATCH_3D_V1')
  await executeMission(admin, instanceId) // pauses at user_input after write_outputs

  const { data: inst } = await sb().from('mission_instances').select('status').eq('id', instanceId).single()
  ok('status = waiting_input', inst?.status === 'waiting_input', `got: ${inst?.status}`)

  const { data: outputs } = await sb().from('core_outputs')
    .select('id, output_type, format, status, mission_instance_id')
    .eq('project_id', projectId).eq('mission_instance_id', instanceId)

  ok('core_outputs rows created', (outputs?.length ?? 0) > 0, `count: ${outputs?.length}`)
  ok('output_type = content', outputs?.[0]?.output_type === 'content')
  ok('status = draft', outputs?.[0]?.status === 'draft')
  ok('mission_instance_id linked', outputs?.[0]?.mission_instance_id === instanceId)
}

async function testOutputsOnInstance(projectId: string) {
  console.log('\n[8] mission_instances.outputs populated on completion')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)
  await seedFact(projectId, 'niche_raw', 'cocina saludable')

  const admin = createAdminClient()
  const instanceId = await createMissionInstance(admin, projectId, 'NICHE_CONFIRM_V1')
  await executeMission(admin, instanceId)
  await resumeMissionAfterInput(admin, instanceId, {
    niche: 'Cocina saludable rápida',
    audience_persona: 'Adultos ocupados',
    positioning: 'Recetas de 20 min o menos',
  })

  const { data: inst } = await sb().from('mission_instances').select('outputs').eq('id', instanceId).single()
  ok('outputs field populated', inst?.outputs !== null && inst?.outputs !== undefined,
    `outputs: ${JSON.stringify(inst?.outputs)}`)
}

async function testMissionCompletedSignal(projectId: string) {
  console.log('\n[9] mission_completed signal emitted after completion')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)
  await seedFact(projectId, 'niche_raw', 'emprendimiento digital')

  const admin = createAdminClient()
  const instanceId = await createMissionInstance(admin, projectId, 'NICHE_CONFIRM_V1')
  await executeMission(admin, instanceId)
  await resumeMissionAfterInput(admin, instanceId, {
    niche: 'Emprendimiento digital',
    audience_persona: 'Emprendedores 25-40',
    positioning: 'De idea a negocio en 90 días',
  })

  const { data: signals } = await sb().from('brain_signals')
    .select('signal_key, value').eq('project_id', projectId).eq('signal_key', 'mission_completed')

  ok('mission_completed signal emitted', (signals?.length ?? 0) > 0)
  const sigVal = signals?.[0]?.value as Record<string, unknown>
  ok('signal has template_code', sigVal?.['template_code'] === 'NICHE_CONFIRM_V1',
    `got: ${sigVal?.['template_code']}`)
  ok('signal has instance_id', sigVal?.['instance_id'] === instanceId)
}

async function testStepLogs(projectId: string) {
  console.log('\n[10] Step logs — all steps recorded in mission_steps')
  await resetState(projectId)
  await seedWallet(projectId, 2000, 0)
  await seedFact(projectId, 'niche_raw', 'marketing digital')

  const admin = createAdminClient()
  const instanceId = await createMissionInstance(admin, projectId, 'NICHE_CONFIRM_V1')
  await executeMission(admin, instanceId)
  await resumeMissionAfterInput(admin, instanceId, {
    niche: 'Marketing digital',
    audience_persona: 'PyMEs latinoamericanas',
    positioning: 'ROI medible desde el mes 1',
  })

  const { data: steps } = await sb().from('mission_steps')
    .select('*').eq('mission_instance_id', instanceId).order('step_number')

  ok('5 steps total', steps?.length === 5, `got: ${steps?.length}`)
  ok('all steps completed', steps?.every((s: { status: string }) => s.status === 'completed'),
    `statuses: ${steps?.map((s: { status: string }) => s.status).join(', ')}`)
  ok('step 1 = brain_read', steps?.[0]?.step_type === 'brain_read')
  ok('step 2 = llm_text', steps?.[1]?.step_type === 'llm_text')
  ok('step 3 = user_input', steps?.[2]?.step_type === 'user_input')
  ok('step 4 = brain_update', steps?.[3]?.step_type === 'brain_update')
  ok('step 5 = finalize', steps?.[4]?.step_type === 'finalize')
  ok('llm_text step has output', !!steps?.[1]?.output)
  ok('user_input step has output', !!steps?.[2]?.output)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Step 11 Mission Runner E2E (direct) ===')
  console.log('NOTE: calls Claude API directly — each LLM group takes 5-30s\n')

  const userId = await getTestUser()
  const projectId = await ensureProject(userId)
  console.log(`Test project: ${projectId}`)

  await testHappyPath(projectId)
  await testIdempotency(projectId)
  await testInsufficientWallet(projectId)
  await testBrainUpdate(projectId)
  await testLedgerDebit(projectId)
  await testWalletDecrement(projectId)
  await testWriteOutputs(projectId)
  await testOutputsOnInstance(projectId)
  await testMissionCompletedSignal(projectId)
  await testStepLogs(projectId)

  console.log(`\n=== ${passed + failed} assertions: ${passed} passed, ${failed} failed ===`)

  await cleanup(projectId)
  await deleteTestUser()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
