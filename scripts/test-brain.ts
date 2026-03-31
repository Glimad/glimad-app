// Step 6 E2E — Brain Module
// Tests every exported function in lib/brain/index.ts
// Run: npx tsx --env-file=.env scripts/test-brain.ts

import { createClient } from '@supabase/supabase-js'
import {
  writeFact,
  readFact,
  readAllFacts,
  readFacts,
  appendSignal,
  readSignals,
  readLatestSignal,
  createSnapshot,
  readSnapshot,
  readLatestSnapshot,
} from '../lib/brain'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

let passed = 0
let failed = 0

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${label}`); passed++ }
  else { console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++ }
}

// ── Seed: borrow a real user_id for FK compliance ──────────────────────────

async function seedProject(db: ReturnType<typeof admin>) {
  const { data: existing } = await db.from('projects').select('user_id').limit(1).single()
  if (!existing) throw new Error('No projects in DB — need at least one real user')

  const { data: proj, error } = await db.from('projects').insert({
    user_id: existing.user_id,
    name: 'Brain Module Test Project',
    status: 'archived',
    phase_code: 'F0',
    active_mode: 'test',
    publishing_mode: 'BUILDING',
  }).select('id').single()

  if (error || !proj) throw new Error(`Project insert failed: ${error?.message}`)
  return proj.id
}

async function cleanup(db: ReturnType<typeof admin>, projectId: string) {
  await db.from('brain_snapshots').delete().eq('project_id', projectId)
  await db.from('brain_signals').delete().eq('project_id', projectId)
  await db.from('brain_facts').delete().eq('project_id', projectId)
  await db.from('projects').delete().eq('id', projectId)
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTS
// ─────────────────────────────────────────────────────────────────────────────

async function testWriteFactCreate(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[1] writeFact — creates new fact row')

  await writeFact(db as any, pid, 'test_string', 'hello', 'test')

  const { data } = await db.from('brain_facts').select('*')
    .eq('project_id', pid).eq('fact_key', 'test_string').single()

  ok('row exists in DB', !!data, 'no row found')
  ok('value matches', data?.value === 'hello', `got ${JSON.stringify(data?.value)}`)
  ok('source is test', data?.source === 'test', `got ${data?.source}`)
  ok('updated_at is set', !!data?.updated_at)
}

async function testWriteFactUpsert(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[2] writeFact — upserts existing fact (same key → replace)')

  await writeFact(db as any, pid, 'test_string', 'world', 'test')

  const { data: rows } = await db.from('brain_facts').select('*')
    .eq('project_id', pid).eq('fact_key', 'test_string')

  ok('only 1 row (not appended)', rows?.length === 1, `got ${rows?.length} rows`)
  ok('value updated to world', rows?.[0]?.value === 'world', `got ${JSON.stringify(rows?.[0]?.value)}`)
}

async function testWriteFactUpdatesAt(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[3] writeFact — updated_at changes on every write')

  const { data: before } = await db.from('brain_facts').select('updated_at')
    .eq('project_id', pid).eq('fact_key', 'test_string').single()

  // Sleep 1ms to ensure timestamp changes
  await new Promise(r => setTimeout(r, 10))
  await writeFact(db as any, pid, 'test_string', 'updated', 'test')

  const { data: after } = await db.from('brain_facts').select('updated_at')
    .eq('project_id', pid).eq('fact_key', 'test_string').single()

  ok('updated_at changed', after?.updated_at !== before?.updated_at,
    `before=${before?.updated_at}, after=${after?.updated_at}`)
}

async function testWriteFactTypes(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[4] writeFact — supports all JSON-compatible value types')

  await writeFact(db as any, pid, 'fact_number', 42, 'test')
  await writeFact(db as any, pid, 'fact_bool', true, 'test')
  await writeFact(db as any, pid, 'fact_object', { nested: { deep: 123 } }, 'test')
  await writeFact(db as any, pid, 'fact_array', [1, 2, 3], 'test')
  // Note: JS null maps to SQL null which violates the NOT NULL JSONB column constraint.
  // Brain facts either exist with a value or don't exist at all — null is not a valid value.

  const { data: rows } = await db.from('brain_facts')
    .select('fact_key, value').eq('project_id', pid)
    .in('fact_key', ['fact_number', 'fact_bool', 'fact_object', 'fact_array'])

  const map = Object.fromEntries(rows?.map(r => [r.fact_key, r.value]) ?? [])
  ok('number stored', map['fact_number'] === 42, `got ${JSON.stringify(map['fact_number'])}`)
  ok('bool stored', map['fact_bool'] === true, `got ${JSON.stringify(map['fact_bool'])}`)
  ok('object stored', (map['fact_object'] as any)?.nested?.deep === 123)
  ok('array stored', Array.isArray(map['fact_array']) && (map['fact_array'] as number[])[1] === 2)
}

async function testReadFact(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[5] readFact — returns value or null')

  const val = await readFact(db as any, pid, 'test_string')
  ok('returns existing value', val === 'updated', `got ${JSON.stringify(val)}`)

  const missing = await readFact(db as any, pid, 'key_that_does_not_exist')
  ok('returns null for missing key', missing === null, `got ${JSON.stringify(missing)}`)
}

async function testReadAllFacts(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[6] readAllFacts — returns key-value map of all facts')

  const facts = await readAllFacts(db as any, pid)

  ok('is a plain object', typeof facts === 'object' && facts !== null && !Array.isArray(facts))
  ok('contains test_string', 'test_string' in facts, `keys=${Object.keys(facts).join(',')}`)
  ok('contains fact_number', 'fact_number' in facts)
  ok('contains fact_object', 'fact_object' in facts)
  ok('test_string value correct', facts['test_string'] === 'updated')
  ok('fact_number value correct', facts['fact_number'] === 42)

  // Row count must match facts in DB
  const { data: rows } = await db.from('brain_facts').select('fact_key').eq('project_id', pid)
  ok('map size matches DB rows', Object.keys(facts).length === (rows?.length ?? -1),
    `map=${Object.keys(facts).length}, db=${rows?.length}`)
}

async function testReadFacts(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[7] readFacts — returns subset by key list')

  const subset = await readFacts(db as any, pid, ['fact_number', 'fact_bool', 'nonexistent_key'])

  ok('returns object', typeof subset === 'object')
  ok('fact_number present', 'fact_number' in subset, `keys=${Object.keys(subset).join(',')}`)
  ok('fact_bool present', 'fact_bool' in subset)
  ok('nonexistent_key absent', !('nonexistent_key' in subset))
  ok('fact_number value correct', subset['fact_number'] === 42)
  ok('returns only requested keys', Object.keys(subset).length === 2,
    `got ${Object.keys(subset).length} keys: ${Object.keys(subset).join(',')}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNALS
// ─────────────────────────────────────────────────────────────────────────────

async function testAppendSignal(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[8] appendSignal — always inserts new row')

  await appendSignal(db as any, pid, 'test.event', { x: 1 }, 'test')
  await appendSignal(db as any, pid, 'test.event', { x: 2 }, 'test')
  await appendSignal(db as any, pid, 'test.event', { x: 3 }, 'test')

  const { data: rows } = await db.from('brain_signals')
    .select('*').eq('project_id', pid).eq('signal_key', 'test.event')

  ok('3 rows written (append-only)', rows?.length === 3, `got ${rows?.length} rows`)
  ok('values are distinct', new Set(rows?.map(r => (r.value as any)?.x)).size === 3)
  ok('source is test', rows?.every(r => r.source === 'test') ?? false)
  ok('observed_at set on all', rows?.every(r => !!r.observed_at) ?? false)
}

async function testReadSignals(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[9] readSignals — time window + optional key filter')

  // All test.event signals are recent — should all appear in 1h window
  const recent = await readSignals(db as any, pid, 1)
  ok('returns array', Array.isArray(recent))
  ok('includes test.event signals', recent.some(s => s.signal_key === 'test.event'))

  // Filter by signal key
  const typed = await readSignals(db as any, pid, 1, 'test.event')
  ok('key filter works', typed.every(s => s.signal_key === 'test.event'),
    `got keys: ${[...new Set(typed.map(s => s.signal_key))].join(',')}`)
  ok('returns correct count', typed.length === 3, `got ${typed.length}`)

  // Filter for a key with no signals
  const empty = await readSignals(db as any, pid, 1, 'nonexistent.signal')
  ok('returns empty array for unknown key', empty.length === 0, `got ${empty.length}`)

  // Time window test: insert an old signal by directly writing to DB
  const oldAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString() // 2h ago
  await db.from('brain_signals').insert({
    project_id: pid,
    signal_key: 'old.signal',
    value: { age: 'old' },
    source: 'test',
    observed_at: oldAt,
  })

  const within1h = await readSignals(db as any, pid, 1, 'old.signal')
  ok('1h window excludes 2h-old signal', within1h.length === 0, `got ${within1h.length}`)

  const within3h = await readSignals(db as any, pid, 3, 'old.signal')
  ok('3h window includes 2h-old signal', within3h.length === 1, `got ${within3h.length}`)
}

async function testReadSignalsOrdering(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[10] readSignals — ordered descending by observed_at (newest first)')

  const signals = await readSignals(db as any, pid, 1, 'test.event')
  ok('at least 2 results to compare', signals.length >= 2)

  if (signals.length >= 2) {
    const times = signals.map(s => new Date(s.observed_at).getTime())
    const isDesc = times.every((t, i) => i === 0 || t <= times[i - 1])
    ok('results are descending by observed_at', isDesc,
      `times: ${times.slice(0, 3).join(' > ')}`)
  }
}

async function testReadLatestSignal(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[11] readLatestSignal — returns most recent of given type')

  // Append a 4th signal that is clearly the newest
  await appendSignal(db as any, pid, 'test.event', { x: 99, newest: true }, 'test')

  const latest = await readLatestSignal(db as any, pid, 'test.event')

  ok('returns object (not null)', latest !== null, 'got null')
  ok('signal_key matches', latest?.signal_key === 'test.event', `got ${latest?.signal_key}`)
  ok('is the newest signal (x=99)', (latest?.value as any)?.x === 99,
    `got value: ${JSON.stringify(latest?.value)}`)

  const missing = await readLatestSignal(db as any, pid, 'signal.that.never.existed')
  ok('returns null for unknown signal type', missing === null, `got ${JSON.stringify(missing)}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// SNAPSHOTS
// ─────────────────────────────────────────────────────────────────────────────

async function testCreateSnapshot(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[12] createSnapshot — inserts immutable snapshot row')

  const state = {
    phase: 'F1',
    facts: { followers: 5000, niche: 'fitness' },
    signals: [{ key: 'scrape_completed', val: 1 }],
  }

  await createSnapshot(db as any, pid, 'phase_changed', state)

  const { data: rows } = await db.from('brain_snapshots')
    .select('*').eq('project_id', pid).order('created_at', { ascending: false })

  ok('row created', (rows?.length ?? 0) > 0, 'no row found')

  const snap = rows?.[0]
  ok('snapshot_type maps phase_changed → phase_assigned', snap?.snapshot_type === 'phase_assigned',
    `got ${snap?.snapshot_type}`)
  ok('phase_code matches state.phase', snap?.phase_code === 'F1', `got ${snap?.phase_code}`)
  // JSONB doesn't preserve key order — compare individual fields instead of stringify
  ok('facts_snapshot stored',
    (snap?.facts_snapshot as any)?.followers === 5000 && (snap?.facts_snapshot as any)?.niche === 'fitness',
    JSON.stringify(snap?.facts_snapshot))
  ok('signals_summary stored', Array.isArray(snap?.signals_summary))
  ok('trigger_source is phase_changed', snap?.trigger_source === 'phase_changed')
  ok('snapshot_hash is 64-char hex', /^[0-9a-f]{64}$/.test(snap?.snapshot_hash ?? ''),
    `got ${snap?.snapshot_hash}`)
  ok('created_at set', !!snap?.created_at)
}

async function testCreateSnapshotTriggerMapping(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[13] createSnapshot — trigger → snapshot_type mapping')

  await createSnapshot(db as any, pid, 'onboarding_completed', { phase: 'F0', facts: {} })
  await createSnapshot(db as any, pid, 'custom_trigger', { phase: 'F2', facts: {} })

  const { data: rows } = await db.from('brain_snapshots')
    .select('snapshot_type, trigger_source').eq('project_id', pid)
    .order('created_at', { ascending: false }).limit(2)

  const latest = rows?.[0]
  const second = rows?.[1]

  ok('unknown trigger → uses trigger as type', latest?.snapshot_type === 'custom_trigger',
    `got ${latest?.snapshot_type}`)
  ok('onboarding_completed → onboarding_completed', second?.snapshot_type === 'onboarding_completed',
    `got ${second?.snapshot_type}`)
}

async function testSnapshotImmutable(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[14] createSnapshot — immutable: multiple calls create multiple rows')

  const stateBefore = await db.from('brain_snapshots').select('id').eq('project_id', pid)
  const countBefore = stateBefore.data?.length ?? 0

  const state = { phase: 'F2', facts: { x: 1 } }
  await createSnapshot(db as any, pid, 'phase_changed', state)
  await createSnapshot(db as any, pid, 'phase_changed', { ...state, facts: { x: 2 } })

  const { data: rows } = await db.from('brain_snapshots').select('id').eq('project_id', pid)
  ok('2 new rows created (not upserted)', (rows?.length ?? 0) === countBefore + 2,
    `before=${countBefore}, after=${rows?.length}`)
}

async function testSnapshotHashDeterministic(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[15] createSnapshot — hash is deterministic for same input')

  const state = { phase: 'F3', facts: { stable: true } }

  // Write two snapshots with identical content — they should have the same hash
  // (different projectId, trigger, state → different hash is expected)
  // Here we test that same projectId+trigger+state → same hash
  await createSnapshot(db as any, pid, 'test_trigger', state)

  const { data: rows } = await db.from('brain_snapshots')
    .select('snapshot_hash, trigger_source')
    .eq('project_id', pid).eq('trigger_source', 'test_trigger')
    .order('created_at', { ascending: false })

  ok('snapshot exists', (rows?.length ?? 0) > 0)
  ok('hash is non-empty hex', /^[0-9a-f]{64}$/.test(rows?.[0]?.snapshot_hash ?? ''))

  // Same input should always produce the same hash (deterministic)
  const { createHash } = await import('crypto')
  const expectedHash = createHash('sha256')
    .update(JSON.stringify({ projectId: pid, trigger: 'test_trigger', state }))
    .digest('hex')

  ok('hash matches expected SHA-256', rows?.[0]?.snapshot_hash === expectedHash,
    `got ${rows?.[0]?.snapshot_hash}, expected ${expectedHash}`)
}

async function testReadSnapshot(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[16] readSnapshot — returns specific snapshot by ID')

  // Get the most recently created snapshot for this project
  const { data: snap } = await db.from('brain_snapshots')
    .select('id').eq('project_id', pid)
    .order('created_at', { ascending: false }).limit(1).single()

  if (!snap?.id) { ok('test snapshot exists', false, 'no snapshots in DB'); return }

  const result = await readSnapshot(db as any, snap.id)
  ok('returns snapshot object', result !== null, 'got null')
  ok('id matches', (result as any)?.id === snap.id, `got ${(result as any)?.id}`)
  ok('project_id correct', (result as any)?.project_id === pid)

  const notFound = await readSnapshot(db as any, '00000000-0000-0000-0000-000000000000')
  ok('returns null for unknown id', notFound === null, `got ${JSON.stringify(notFound)}`)
}

async function testReadLatestSnapshot(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[17] readLatestSnapshot — returns most recent snapshot')

  // Create a clearly-newest snapshot
  const newestState = { phase: 'F7', facts: { newest: true } }
  await createSnapshot(db as any, pid, 'test_latest', newestState)

  const latest = await readLatestSnapshot(db as any, pid)

  ok('returns object', latest !== null, 'got null')
  ok('trigger_source is test_latest', (latest as any)?.trigger_source === 'test_latest',
    `got ${(latest as any)?.trigger_source}`)
  ok('phase_code is F7', (latest as any)?.phase_code === 'F7',
    `got ${(latest as any)?.phase_code}`)
  ok('facts_snapshot has newest=true', (latest as any)?.facts_snapshot?.newest === true)
}

async function testReadLatestSnapshotEmpty(db: ReturnType<typeof admin>) {
  console.log('\n[18] readLatestSnapshot — returns null when no snapshots exist')

  // Use a fake project UUID that has no snapshots
  const result = await readLatestSnapshot(db as any, '00000000-0000-0000-0000-000000000000')
  ok('returns null for project with no snapshots', result === null, `got ${JSON.stringify(result)}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-PROJECT ISOLATION
// ─────────────────────────────────────────────────────────────────────────────

async function testIsolation(db: ReturnType<typeof admin>, pid: string) {
  console.log('\n[19] Cross-project isolation — facts/signals/snapshots stay per-project')

  const otherPid = '00000000-0000-0000-0000-111111111111'

  const factVal = await readFact(db as any, otherPid, 'test_string')
  ok('readFact: no cross-project leakage', factVal === null, `got ${JSON.stringify(factVal)}`)

  const allFacts = await readAllFacts(db as any, otherPid)
  ok('readAllFacts: empty for other project', Object.keys(allFacts).length === 0,
    `got ${Object.keys(allFacts).length} facts`)

  const sigs = await readSignals(db as any, otherPid, 24)
  ok('readSignals: empty for other project', sigs.length === 0, `got ${sigs.length}`)

  const snap = await readLatestSnapshot(db as any, otherPid)
  ok('readLatestSnapshot: null for other project', snap === null, `got ${JSON.stringify(snap)}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Brain Module E2E Test (Step 6) ===\n')

  const db = admin()
  const pid = await seedProject(db)
  console.log(`Test project: ${pid}`)

  try {
    // Facts
    await testWriteFactCreate(db, pid)
    await testWriteFactUpsert(db, pid)
    await testWriteFactUpdatesAt(db, pid)
    await testWriteFactTypes(db, pid)
    await testReadFact(db, pid)
    await testReadAllFacts(db, pid)
    await testReadFacts(db, pid)

    // Signals
    await testAppendSignal(db, pid)
    await testReadSignals(db, pid)
    await testReadSignalsOrdering(db, pid)
    await testReadLatestSignal(db, pid)

    // Snapshots
    await testCreateSnapshot(db, pid)
    await testCreateSnapshotTriggerMapping(db, pid)
    await testSnapshotImmutable(db, pid)
    await testSnapshotHashDeterministic(db, pid)
    await testReadSnapshot(db, pid)
    await testReadLatestSnapshot(db, pid)
    await testReadLatestSnapshotEmpty(db)

    // Cross-project isolation
    await testIsolation(db, pid)

  } catch (err) {
    console.error('\nFATAL:', (err as Error).message)
    failed++
  } finally {
    console.log('\nCleaning up...')
    await cleanup(db, pid)
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`)
    process.exit(failed > 0 ? 1 : 0)
  }
}

main()
