// GET /api/brain/history?project_id=...&fact_key=...&limit=20
// Returns the audit history for a specific brain fact.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const project_id = searchParams.get('project_id')
  const fact_key = searchParams.get('fact_key')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)

  const admin = createAdminClient()

  let query = admin
    .from('brain_facts_history')
    .select('*')
    .eq('project_id', project_id!)
    .order('changed_at', { ascending: false })
    .limit(limit)

  if (fact_key) query = query.eq('fact_key', fact_key)

  const { data } = await query

  return NextResponse.json({ history: data ?? [] })
}
