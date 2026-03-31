import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'

type AdminClient = ReturnType<typeof createAdminClient>

// ── Facts ──────────────────────────────────────────────────────────────────

export async function writeFact(
  admin: AdminClient,
  projectId: string,
  key: string,
  value: unknown,
  source = 'system'
) {
  await admin.from('brain_facts').upsert(
    {
      project_id: projectId,
      fact_key: key,
      value: value,
      source,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id,fact_key' }
  )
}

export async function readFact(
  admin: AdminClient,
  projectId: string,
  key: string
): Promise<unknown | null> {
  const { data } = await admin
    .from('brain_facts')
    .select('value')
    .eq('project_id', projectId)
    .eq('fact_key', key)
    .single()
  return data?.value ?? null
}

export async function readAllFacts(
  admin: AdminClient,
  projectId: string
): Promise<Record<string, unknown>> {
  const { data } = await admin
    .from('brain_facts')
    .select('fact_key, value')
    .eq('project_id', projectId)
  const map: Record<string, unknown> = {}
  for (const row of data ?? []) map[row.fact_key] = row.value
  return map
}

export async function readFacts(
  admin: AdminClient,
  projectId: string,
  keys: string[]
): Promise<Record<string, unknown>> {
  const { data } = await admin
    .from('brain_facts')
    .select('fact_key, value')
    .eq('project_id', projectId)
    .in('fact_key', keys)
  const map: Record<string, unknown> = {}
  for (const row of data ?? []) map[row.fact_key] = row.value
  return map
}

// ── Signals ───────────────────────────────────────────────────────────────

export async function appendSignal(
  admin: AdminClient,
  projectId: string,
  signalKey: string,
  value: unknown,
  source = 'system'
) {
  await admin.from('brain_signals').insert({
    project_id: projectId,
    signal_key: signalKey,
    value: value,
    source,
    observed_at: new Date().toISOString(),
  })
}

export async function readSignals(
  admin: AdminClient,
  projectId: string,
  sinceHours: number,
  signalKey?: string
) {
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString()
  let q = admin
    .from('brain_signals')
    .select('*')
    .eq('project_id', projectId)
    .gte('observed_at', since)
    .order('observed_at', { ascending: false })
  if (signalKey) q = q.eq('signal_key', signalKey)
  const { data } = await q
  return data ?? []
}

export async function readLatestSignal(
  admin: AdminClient,
  projectId: string,
  signalKey: string
) {
  const { data } = await admin
    .from('brain_signals')
    .select('*')
    .eq('project_id', projectId)
    .eq('signal_key', signalKey)
    .order('observed_at', { ascending: false })
    .limit(1)
    .single()
  return data ?? null
}

// ── Snapshots ─────────────────────────────────────────────────────────────

export type BrainState = {
  phase: string
  facts: Record<string, unknown>
  signals?: unknown[]
}

export async function createSnapshot(
  admin: AdminClient,
  projectId: string,
  trigger: string,
  state: BrainState
) {
  const snapshotHash = createHash('sha256')
    .update(JSON.stringify({ projectId, trigger, state }))
    .digest('hex')

  const TRIGGER_TO_TYPE: Record<string, string> = {
    phase_changed: 'phase_assigned',
    onboarding_completed: 'onboarding_completed',
  }
  const snapshotType = TRIGGER_TO_TYPE[trigger] ?? trigger

  await admin.from('brain_snapshots').insert({
    project_id: projectId,
    snapshot_type: snapshotType,
    phase_code: state.phase,
    facts_snapshot: state.facts,
    signals_summary: state.signals ?? null,
    trigger_source: trigger,
    snapshot_hash: snapshotHash,
  })
}

export async function readSnapshot(admin: AdminClient, snapshotId: string) {
  const { data } = await admin
    .from('brain_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .single()
  return data ?? null
}

export async function readLatestSnapshot(admin: AdminClient, projectId: string) {
  const { data } = await admin
    .from('brain_snapshots')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data ?? null
}
