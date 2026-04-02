// POST /api/brain/rollback
// Rolls back a single brain fact to a previous value from brain_facts_history.
// Body: { project_id, fact_key, history_id }
// Returns: the new brain_facts row after rollback.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeFact } from '@/lib/brain'

export async function POST(req: NextRequest) {
  const { project_id, fact_key, history_id } = await req.json()

  const admin = createAdminClient()

  // Verify the project exists (also serves as basic ownership check in admin context)
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', project_id)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 })
  }

  // Fetch the history entry to roll back to
  const { data: historyEntry } = await admin
    .from('brain_facts_history')
    .select('*')
    .eq('id', history_id)
    .eq('project_id', project_id)
    .eq('fact_key', fact_key)
    .single()

  if (!historyEntry) {
    return NextResponse.json({ error: 'history_entry_not_found' }, { status: 404 })
  }

  // Roll back: write the old_value as the new fact value
  await writeFact(admin, project_id, fact_key, historyEntry.old_value, 'rollback')

  // Return the updated fact
  const { data: updatedFact } = await admin
    .from('brain_facts')
    .select('*')
    .eq('project_id', project_id)
    .eq('fact_key', fact_key)
    .single()

  return NextResponse.json({ fact: updatedFact, rolled_back_to: historyEntry.old_value })
}
