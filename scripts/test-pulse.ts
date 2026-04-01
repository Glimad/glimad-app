// Step 14 Daily Pulse E2E — tests pulse API routes via live Vercel deployment
// Run: npx tsx --env-file=.env scripts/test-pulse.ts
//
// Test groups:
//   1.  POST /api/pulse/run triggers pulse and returns action_items
//   2.  action_items have correct schema (priority, category, action, reasoning)
//   3.  pulse_completed signal emitted to brain
//   4.  POST /api/pulse/run rate-limits within 6h window
//   5.  Pulse with no brain signals returns 429 (no signals = no pulse)
//   6.  Unauthorized request returns 401

import { createClient } from '@supabase/supabase-js'

const BASE = 'https://glimad-app.vercel.app'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let passed = 0
let failed = 0

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${label}`); passed++ }
  else { console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++ }
}

const TEST_EMAIL = `e2e-pulse-${Date.now()}@glimad-test.dev`
const TEST_PASSWORD = 'E2eTestPass123!'
let testUserId: string | null = null

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

async function getToken(): Promise<{ token: string; userId: string }> {
  const { data: created, error } = await sb().auth.admin.createUser({
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
  await sb().auth.admin.deleteUser(testUserId)
}

async function ensureProject(userId: string): Promise<string> {
  const { data: proj } = await sb()
    .from('projects')
    .update({ name: 'Pulse Test', status: 'active', phase_code: 'F1', active_mode: 'test', publishing_mode: 'BUILDING', focus_platform: 'instagram' })
    .eq('user_id', userId)
    .select('id').single()
  if (!proj) throw new Error('Project update failed')

  await sb().from('brain_facts').upsert([
    { project_id: proj.id, fact_key: 'niche_raw', value: 'fitness', source: 'test', updated_at: new Date().toISOString() },
    { project_id: proj.id, fact_key: 'focus_platform', value: 'instagram', source: 'test', updated_at: new Date().toISOString() },
  ], { onConflict: 'project_id,fact_key' })

  return proj.id
}

async function seedSignal(projectId: string) {
  await sb().from('brain_signals').insert({
    project_id: projectId,
    signal_key: 'content_published',
    value: { platform: 'instagram' },
    source: 'test',
  })
}

async function cleanup(projectId: string) {
  await sb().from('pulse_runs').delete().eq('project_id', projectId)
  await sb().from('brain_signals').delete().eq('project_id', projectId)
  await sb().from('brain_facts').delete().eq('project_id', projectId)
  await sb().from('projects').delete().eq('id', projectId)
}

async function post(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : {} }
}

async function main() {
  console.log('=== Step 14 Daily Pulse E2E ===')
  console.log(`Target: ${BASE}\n`)

  const { token, userId } = await getToken()
  const projectId = await ensureProject(userId)
  console.log(`Test project: ${projectId}`)

  await seedSignal(projectId)

  console.log('\n[1] POST /api/pulse/run triggers pulse and returns action_items')
  const { status: s1, data: d1 } = await post('/api/pulse/run', token)
  ok('status 200', s1 === 200, `got: ${s1} — ${JSON.stringify(d1)}`)
  ok('pulse object returned', !!d1.pulse, `got: ${JSON.stringify(d1)}`)
  ok('action_items is array', Array.isArray(d1.pulse?.action_items), `got: ${typeof d1.pulse?.action_items}`)
  ok('3-7 action items', (d1.pulse?.action_items?.length ?? 0) >= 3 && (d1.pulse?.action_items?.length ?? 0) <= 7,
    `got: ${d1.pulse?.action_items?.length}`)
  ok('signals_collected > 0', (d1.pulse?.signals_collected ?? 0) > 0, `got: ${d1.pulse?.signals_collected}`)

  console.log('\n[2] action_items have correct schema')
  const item = d1.pulse?.action_items?.[0]
  ok('priority is high|medium|low', ['high', 'medium', 'low'].includes(item?.priority), `got: ${item?.priority}`)
  ok('category is valid', ['content', 'consistency', 'growth', 'engagement'].includes(item?.category), `got: ${item?.category}`)
  ok('action is string', typeof item?.action === 'string')
  ok('reasoning is string', typeof item?.reasoning === 'string')

  console.log('\n[3] pulse_completed signal emitted to brain')
  const { data: signals } = await sb()
    .from('brain_signals')
    .select('signal_key, value')
    .eq('project_id', projectId)
    .eq('signal_key', 'pulse_completed')
  ok('pulse_completed signal present', (signals?.length ?? 0) > 0)
  const sigVal = signals?.[0]?.value as Record<string, unknown>
  ok('signal has action_items_count', typeof sigVal?.['action_items_count'] === 'number')

  console.log('\n[4] POST /api/pulse/run rate-limits within 6h window')
  // Verify the pulse_run was persisted
  const { data: pulseRunCheck } = await sb().from('pulse_runs').select('id, completed_at').eq('project_id', projectId).not('completed_at', 'is', null).limit(1)
  ok('pulse_run persisted in DB', (pulseRunCheck?.length ?? 0) > 0, `rows: ${pulseRunCheck?.length}`)
  const { status: s4 } = await post('/api/pulse/run', token)
  ok('429 on second run within 6h', s4 === 429, `got: ${s4}`)

  console.log('\n[5] Project with no brain signals returns 429')
  // Delete all brain_signals for this project, then delete the recent pulse_run so rate limit doesn't apply
  await sb().from('pulse_runs').delete().eq('project_id', projectId)
  await sb().from('brain_signals').delete().eq('project_id', projectId)
  const { status: s5 } = await post('/api/pulse/run', token)
  ok('429 when no brain signals', s5 === 429, `got: ${s5}`)

  console.log('\n[6] Unauthorized request returns 401')
  const r = await fetch(`${BASE}/api/pulse/run`, { method: 'POST' })
  ok('POST /pulse/run 401 without auth', r.status === 401, `got: ${r.status}`)

  console.log(`\n=== ${passed + failed} assertions: ${passed} passed, ${failed} failed ===`)

  await cleanup(projectId)
  await deleteTestUser()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
