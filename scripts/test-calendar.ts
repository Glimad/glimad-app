// Step 13 Calendar E2E — tests calendar API routes via live Vercel deployment
// Run: npx tsx --env-file=.env scripts/test-calendar.ts
//
// Test groups:
//   1.  GET /api/calendar returns items + drafts arrays
//   2.  Scheduled item appears in correct month
//   3.  Draft item (null scheduled_at) appears in drafts array
//   4.  PATCH state: scheduled → published emits content_published signal
//   5.  PATCH state: scheduled → paused
//   6.  PATCH state: paused → scheduled (resume)
//   7.  PATCH state: failed → scheduled (retry)
//   8.  PATCH reschedule (update scheduled_at only)
//   9.  Draft approve: PATCH state=scheduled + scheduled_at moves to items
//   10. Invalid transition returns 422
//   11. Published item cannot transition to any state
//   12. DELETE removes item
//   13. Unauthorized requests return 401

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

const TEST_EMAIL = `e2e-cal-${Date.now()}@glimad-test.dev`
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
    .update({ name: 'Cal Test', status: 'active', phase_code: 'F1', active_mode: 'test', publishing_mode: 'BUILDING', focus_platform: 'instagram' })
    .eq('user_id', userId)
    .select('id').single()
  if (!proj) throw new Error('Project update failed')
  return proj.id
}

async function seedItem(projectId: string, state: string, scheduledAt: string | null): Promise<string> {
  const { data: asset } = await sb().from('core_assets').insert({
    project_id: projectId,
    asset_type: 'content_piece',
    content: { hook: 'Test hook', caption: 'Test caption', talking_points: [], cta: 'Follow', hashtags: [] },
    title: 'Test',
  }).select('id').single()

  const { data: item } = await sb().from('core_calendar_items').insert({
    project_id: projectId,
    asset_id: asset!.id,
    content_type: 'reel',
    platform: 'instagram',
    state,
    scheduled_at: scheduledAt,
  }).select('id').single()

  return item!.id
}

async function cleanup(projectId: string) {
  await sb().from('brain_signals').delete().eq('project_id', projectId)
  await sb().from('core_calendar_items').delete().eq('project_id', projectId)
  await sb().from('core_assets').delete().eq('project_id', projectId)
  await sb().from('projects').delete().eq('id', projectId)
}

async function get(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : {} }
}

async function patch(path: string, token: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : {} }
}

async function del(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : {} }
}

async function main() {
  console.log('=== Step 13 Calendar E2E ===')
  console.log(`Target: ${BASE}\n`)

  const { token, userId } = await getToken()
  const projectId = await ensureProject(userId)
  console.log(`Test project: ${projectId}`)

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const tomorrow = new Date(Date.now() + 86400000).toISOString()

  // Seed items
  const scheduledId = await seedItem(projectId, 'scheduled', tomorrow)
  const draftId = await seedItem(projectId, 'draft', null)
  const failedId = await seedItem(projectId, 'failed', tomorrow)
  const pausedId = await seedItem(projectId, 'paused', tomorrow)

  console.log('\n[1] GET /api/calendar returns items + drafts arrays')
  const { status: s1, data: d1 } = await get(`/api/calendar?month=${thisMonth}`, token)
  ok('status 200', s1 === 200, `got: ${s1}`)
  ok('items is array', Array.isArray(d1.items), `got: ${typeof d1.items}`)
  ok('drafts is array', Array.isArray(d1.drafts), `got: ${typeof d1.drafts}`)

  console.log('\n[2] Scheduled item appears in correct month')
  ok('scheduled item in items', d1.items?.some((i: { id: string }) => i.id === scheduledId), `ids: ${d1.items?.map((i: { id: string }) => i.id)}`)

  console.log('\n[3] Draft item appears in drafts array')
  ok('draft item in drafts', d1.drafts?.some((i: { id: string }) => i.id === draftId))

  console.log('\n[4] PATCH scheduled → published emits content_published signal')
  await sb().from('brain_signals').delete().eq('project_id', projectId).eq('signal_key', 'content_published')
  const { status: s4, data: d4 } = await patch(`/api/calendar/${scheduledId}`, token, { state: 'published' })
  ok('status 200', s4 === 200, `got: ${s4}`)
  ok('item state = published', d4.item?.state === 'published', `got: ${d4.item?.state}`)
  const { data: sigs } = await sb().from('brain_signals').select('signal_key, value').eq('project_id', projectId).eq('signal_key', 'content_published')
  ok('content_published signal emitted', (sigs?.length ?? 0) > 0)
  ok('signal has date', !!(sigs?.[0]?.value as Record<string, unknown>)?.['date'])

  console.log('\n[5] PATCH scheduled → paused')
  const pauseTarget = await seedItem(projectId, 'scheduled', tomorrow)
  const { status: s5, data: d5 } = await patch(`/api/calendar/${pauseTarget}`, token, { state: 'paused' })
  ok('status 200', s5 === 200, `got: ${s5}`)
  ok('item state = paused', d5.item?.state === 'paused', `got: ${d5.item?.state}`)

  console.log('\n[6] PATCH paused → scheduled (resume)')
  const { status: s6, data: d6 } = await patch(`/api/calendar/${pausedId}`, token, { state: 'scheduled' })
  ok('status 200', s6 === 200, `got: ${s6}`)
  ok('item state = scheduled', d6.item?.state === 'scheduled', `got: ${d6.item?.state}`)

  console.log('\n[7] PATCH failed → scheduled (retry)')
  const { status: s7, data: d7 } = await patch(`/api/calendar/${failedId}`, token, { state: 'scheduled' })
  ok('status 200', s7 === 200, `got: ${s7}`)
  ok('item state = scheduled', d7.item?.state === 'scheduled', `got: ${d7.item?.state}`)

  console.log('\n[8] PATCH reschedule (update scheduled_at only)')
  const newDate = new Date(Date.now() + 2 * 86400000).toISOString()
  const { status: s8, data: d8 } = await patch(`/api/calendar/${pauseTarget}`, token, { scheduled_at: newDate })
  ok('status 200', s8 === 200, `got: ${s8}`)
  ok('scheduled_at updated', d8.item?.scheduled_at?.slice(0, 10) === newDate.slice(0, 10), `got: ${d8.item?.scheduled_at}`)

  console.log('\n[9] Draft approve: PATCH state=scheduled + scheduled_at')
  const approveDraftId = await seedItem(projectId, 'draft', null)
  const approveDate = new Date(Date.now() + 3 * 86400000).toISOString()
  const { status: s9, data: d9 } = await patch(`/api/calendar/${approveDraftId}`, token, { state: 'scheduled', scheduled_at: approveDate })
  ok('status 200', s9 === 200, `got: ${s9}`)
  ok('item state = scheduled', d9.item?.state === 'scheduled', `got: ${d9.item?.state}`)
  ok('scheduled_at set', !!d9.item?.scheduled_at)

  console.log('\n[10] Invalid transition returns 422')
  const { status: s10 } = await patch(`/api/calendar/${scheduledId}`, token, { state: 'scheduled' })
  ok('422 for published → scheduled', s10 === 422, `got: ${s10}`)

  console.log('\n[11] Published item cannot transition to any other state')
  const { status: s11a } = await patch(`/api/calendar/${scheduledId}`, token, { state: 'draft' })
  const { status: s11b } = await patch(`/api/calendar/${scheduledId}`, token, { state: 'paused' })
  ok('published → draft = 422', s11a === 422, `got: ${s11a}`)
  ok('published → paused = 422', s11b === 422, `got: ${s11b}`)

  console.log('\n[12] DELETE removes item')
  const deleteTarget = await seedItem(projectId, 'draft', null)
  const { status: s12 } = await del(`/api/calendar/${deleteTarget}`, token)
  ok('status 200', s12 === 200, `got: ${s12}`)
  const { data: check } = await sb().from('core_calendar_items').select('id').eq('id', deleteTarget).single()
  ok('row deleted from DB', !check)

  console.log('\n[13] Unauthorized requests return 401')
  const r1 = await fetch(`${BASE}/api/calendar`)
  ok('GET /calendar 401 without auth', r1.status === 401, `got: ${r1.status}`)
  const r2 = await fetch(`${BASE}/api/calendar/fake-id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  ok('PATCH /calendar/:id 401 without auth', r2.status === 401, `got: ${r2.status}`)
  const r3 = await fetch(`${BASE}/api/calendar/fake-id`, { method: 'DELETE' })
  ok('DELETE /calendar/:id 401 without auth', r3.status === 401, `got: ${r3.status}`)

  console.log(`\n=== ${passed + failed} assertions: ${passed} passed, ${failed} failed ===`)

  await cleanup(projectId)
  await deleteTestUser()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
