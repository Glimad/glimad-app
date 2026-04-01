// Step 12 Content Studio E2E — tests studio API routes via live Vercel deployment
// Run: npx tsx --env-file=.env scripts/test-studio.ts
//
// Test groups:
//   1.  GET /api/studio/topics returns platform + caption_limit
//   2.  POST /api/studio/topics returns 6 topic strings
//   3.  POST /api/studio/generate returns valid content JSON
//   4.  POST /api/studio/approve saves core_assets + core_calendar_items (scheduled)
//   5.  POST /api/studio/approve saves core_assets as draft (no scheduled_at)
//   6.  Approve emits content_created signal to brain
//   7.  LLM debit recorded in core_ledger with positive amount_allowance
//   8.  Unauthorized requests return 401

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

const TEST_EMAIL = `e2e-studio-${Date.now()}@glimad-test.dev`
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

// ── Project setup ─────────────────────────────────────────────────────────────

async function ensureProject(userId: string): Promise<string> {
  const { data: proj } = await sb()
    .from('projects')
    .update({ name: 'Studio Test', status: 'active', phase_code: 'F1', active_mode: 'test', publishing_mode: 'BUILDING', focus_platform: 'instagram', focus_platform_handle: 'testuser' })
    .eq('user_id', userId)
    .select('id').single()
  if (!proj) throw new Error('Project update failed')

  await sb().from('core_subscriptions').upsert({
    project_id: proj.id, user_id: userId,
    stripe_customer_id: `cus_studio_${Date.now()}`,
    stripe_subscription_id: `sub_studio_${Date.now()}`,
    plan_code: 'BASE', status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
  }, { onConflict: 'stripe_subscription_id' })

  await sb().from('core_wallets').upsert({
    project_id: proj.id, plan_code: 'BASE',
    allowance_llm_balance: 2000, credits_allowance: 2000,
    premium_credits_balance: 0, premium_daily_cap_remaining: 0,
    allowance_reset_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    premium_reset_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    status: 'active', updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id' })

  await sb().from('brain_facts').upsert([
    { project_id: proj.id, fact_key: 'niche_raw', value: 'fitness para mamás', source: 'test', updated_at: new Date().toISOString() },
    { project_id: proj.id, fact_key: 'focus_platform', value: 'instagram', source: 'test', updated_at: new Date().toISOString() },
    { project_id: proj.id, fact_key: 'audience_persona', value: 'Mamás de 30-45', source: 'test', updated_at: new Date().toISOString() },
  ], { onConflict: 'project_id,fact_key' })

  return proj.id
}

async function cleanup(projectId: string) {
  await sb().from('core_calendar_items').delete().eq('project_id', projectId)
  await sb().from('core_assets').delete().eq('project_id', projectId)
  await sb().from('brain_signals').delete().eq('project_id', projectId)
  await sb().from('brain_facts').delete().eq('project_id', projectId)
  await sb().from('core_ledger').delete().eq('project_id', projectId)
  await sb().from('core_wallets').delete().eq('project_id', projectId)
  await sb().from('core_subscriptions').delete().eq('project_id', projectId)
  await sb().from('projects').delete().eq('id', projectId)
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function get(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  return { status: res.status, data: await res.json() }
}

async function post(path: string, token: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json() }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testGetPlatformContext(token: string) {
  console.log('\n[1] GET /api/studio/topics returns platform + caption_limit')
  const { status, data } = await get('/api/studio/topics', token)
  ok('status 200', status === 200, `got: ${status}`)
  ok('platform = instagram', data.platform === 'instagram', `got: ${data.platform}`)
  ok('caption_limit = 2200', data.caption_limit === 2200, `got: ${data.caption_limit}`)
}

async function testTopics(token: string) {
  console.log('\n[2] POST /api/studio/topics returns 6 topic strings')
  const { status, data } = await post('/api/studio/topics', token, { content_type: 'reel' })
  ok('status 200', status === 200, `got: ${status}`)
  ok('topics is array', Array.isArray(data.topics), `got: ${typeof data.topics}`)
  ok('exactly 6 topics', data.topics?.length === 6, `got: ${data.topics?.length}`)
  ok('topics are strings', typeof data.topics?.[0] === 'string')
}

async function testGenerate(token: string): Promise<{ hook: string; caption: string; talking_points: string[]; cta: string; hashtags: string[] } | null> {
  console.log('\n[3] POST /api/studio/generate returns valid content JSON')
  const { status, data } = await post('/api/studio/generate', token, {
    content_type: 'reel',
    topic: 'Rutina de 10 minutos para mamás',
  })
  ok('status 200', status === 200, `got: ${status}`)
  ok('content object returned', !!data.content, `got: ${JSON.stringify(data)}`)
  ok('hook present', typeof data.content?.hook === 'string')
  ok('caption present', typeof data.content?.caption === 'string')
  ok('talking_points is array', Array.isArray(data.content?.talking_points))
  ok('cta present', typeof data.content?.cta === 'string')
  ok('hashtags is array', Array.isArray(data.content?.hashtags))
  return data.content ?? null
}

async function testApproveScheduled(projectId: string, token: string) {
  console.log('\n[4] POST /api/studio/approve saves core_assets + core_calendar_items (scheduled)')
  const scheduledAt = new Date(Date.now() + 86400000).toISOString() // tomorrow
  const { status, data } = await post('/api/studio/approve', token, {
    content_type: 'reel',
    topic: 'Test topic scheduled',
    content: {
      hook: 'Test hook',
      caption: 'Test caption',
      talking_points: ['point 1', 'point 2'],
      cta: 'Follow me',
      hashtags: ['fitness', 'mamas'],
    },
    scheduled_at: scheduledAt,
  })
  ok('status 200', status === 200, `got: ${status}`)
  ok('asset_id returned', !!data.asset_id)
  ok('calendar_item_id returned', !!data.calendar_item_id)

  // Verify DB rows
  const { data: asset } = await sb().from('core_assets').select('asset_type, content').eq('id', data.asset_id).single()
  ok('core_assets row created', !!asset)
  ok('asset_type = content_piece', asset?.asset_type === 'content_piece')
  ok('content saved', (asset?.content as Record<string, unknown>)?.['hook'] === 'Test hook')

  const { data: cal } = await sb().from('core_calendar_items').select('state, scheduled_at').eq('id', data.calendar_item_id).single()
  ok('calendar_item state = scheduled', cal?.state === 'scheduled')
  ok('scheduled_at stored', !!cal?.scheduled_at)
}

async function testApproveDraft(projectId: string, token: string) {
  console.log('\n[5] POST /api/studio/approve saves core_assets as draft (no scheduled_at)')
  const { status, data } = await post('/api/studio/approve', token, {
    content_type: 'carousel',
    topic: 'Test topic draft',
    content: {
      hook: 'Draft hook',
      caption: 'Draft caption',
      talking_points: ['a', 'b'],
      cta: 'Save this',
      hashtags: ['test'],
    },
    scheduled_at: null,
  })
  ok('status 200', status === 200)

  const { data: cal } = await sb().from('core_calendar_items').select('state').eq('id', data.calendar_item_id).single()
  ok('calendar_item state = draft', cal?.state === 'draft')
}

async function testSignalEmitted(projectId: string, token: string) {
  console.log('\n[6] Approve emits content_created signal to brain')
  // Clear signals first
  await sb().from('brain_signals').delete().eq('project_id', projectId).eq('signal_key', 'content_created')

  await post('/api/studio/approve', token, {
    content_type: 'post',
    topic: 'Signal test',
    content: { hook: 'h', caption: 'c', talking_points: [], cta: 'cta', hashtags: [] },
    scheduled_at: null,
  })

  const { data: signals } = await sb().from('brain_signals')
    .select('signal_key, value')
    .eq('project_id', projectId)
    .eq('signal_key', 'content_created')

  ok('content_created signal emitted', (signals?.length ?? 0) > 0)
  const val = signals?.[0]?.value as Record<string, unknown>
  ok('signal has content_type', val?.['content_type'] === 'post')
  ok('signal has topic', val?.['topic'] === 'Signal test')
}

async function testLedgerDebit(projectId: string, token: string) {
  console.log('\n[7] LLM debit recorded in core_ledger with positive amount_allowance')
  // Clear ledger before this test
  await sb().from('core_ledger').delete().eq('project_id', projectId).eq('reason_key', 'LLM_CALL_STUDIO')

  await post('/api/studio/generate', token, {
    content_type: 'reel',
    topic: 'Ledger test topic unique ' + Date.now(),
  })

  const { data: ledger } = await sb().from('core_ledger')
    .select('amount_allowance, kind')
    .eq('project_id', projectId)
    .eq('reason_key', 'LLM_CALL_STUDIO')

  ok('ledger row created', (ledger?.length ?? 0) > 0)
  ok('amount_allowance is positive', (ledger?.[0]?.amount_allowance ?? 0) > 0,
    `got: ${ledger?.[0]?.amount_allowance}`)
  ok('kind = debit', ledger?.[0]?.kind === 'debit')
}

async function testUnauthorized() {
  console.log('\n[8] Unauthorized requests return 401')
  const r1 = await fetch(`${BASE}/api/studio/topics`)
  ok('GET /topics 401 without auth', r1.status === 401, `got: ${r1.status}`)

  const r2 = await fetch(`${BASE}/api/studio/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  ok('POST /generate 401 without auth', r2.status === 401, `got: ${r2.status}`)

  const r3 = await fetch(`${BASE}/api/studio/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  ok('POST /approve 401 without auth', r3.status === 401, `got: ${r3.status}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Step 12 Content Studio E2E ===')
  console.log(`Target: ${BASE}\n`)

  const { token, userId } = await getToken()
  const projectId = await ensureProject(userId)
  console.log(`Test project: ${projectId}`)

  await testGetPlatformContext(token)
  await testTopics(token)
  await testGenerate(token)
  await testApproveScheduled(projectId, token)
  await testApproveDraft(projectId, token)
  await testSignalEmitted(projectId, token)
  await testLedgerDebit(projectId, token)
  await testUnauthorized()

  console.log(`\n=== ${passed + failed} assertions: ${passed} passed, ${failed} failed ===`)

  await cleanup(projectId)
  await deleteTestUser()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
