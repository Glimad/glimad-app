// GET /api/brain/history?project_id=...&fact_key=...&limit=20
// Returns the audit history for a specific brain fact.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/extract-token'

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const project_id = searchParams.get('project_id')
  const fact_key = searchParams.get('fact_key')
  const parsed = parseInt(searchParams.get('limit') ?? '20', 10)
  const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 20
  if (!project_id) return NextResponse.json({ error: 'project_id_required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', project_id)
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()
  if (!project) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let query = admin
    .from('brain_facts_history')
    .select('*')
    .eq('project_id', project_id)
    .order('changed_at', { ascending: false })
    .limit(limit)

  if (fact_key) query = query.eq('fact_key', fact_key)

  const { data } = await query

  return NextResponse.json({ history: data ?? [] })
}
