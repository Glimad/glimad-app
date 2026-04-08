// GET /api/monetization/events — list revenue events for project
// POST /api/monetization/events — log revenue event (append-only)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProjectId } from '@/lib/supabase/project'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const parsed = parseInt(searchParams.get('limit') ?? '50', 10)
  const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 200) : 50
  const admin = createAdminClient()
  let projectId: string
  try {
    projectId = await getProjectId(req, admin)
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500
    return NextResponse.json({ error: (error as Error).message }, { status })
  }
  const { data: project } = await admin.from('projects').select('phase_code').eq('id', projectId).single()
  const phaseRank: Record<string, number> = { F0: 0, F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7 }
  if (!project || (phaseRank[project.phase_code ?? 'F0'] ?? 0) < 3) {
    return NextResponse.json({ error: 'requires_f3_plus' }, { status: 403 })
  }

  const { data } = await admin
    .from('monetization_events')
    .select('*, monetization_products(name, type)')
    .eq('project_id', projectId)
    .order('event_date', { ascending: false })
    .limit(limit)

  return NextResponse.json({ events: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const admin = createAdminClient()
  let projectId: string
  try {
    projectId = await getProjectId(req, admin)
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500
    return NextResponse.json({ error: (error as Error).message }, { status })
  }
  const { data: project } = await admin.from('projects').select('phase_code').eq('id', projectId).single()
  const phaseRank: Record<string, number> = { F0: 0, F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7 }
  if (!project || (phaseRank[project.phase_code ?? 'F0'] ?? 0) < 3) {
    return NextResponse.json({ error: 'requires_f3_plus' }, { status: 403 })
  }

  const { data: event } = await admin
    .from('monetization_events')
    .insert({
      project_id: projectId,
      product_id: body.product_id ?? null,
      event_type: body.event_type,
      amount: body.amount ?? 0,
      currency: body.currency ?? 'EUR',
      source: body.source ?? 'manual',
      note: body.note ?? null,
      event_date: body.event_date ?? new Date().toISOString().substring(0, 10),
    })
    .select()
    .single()

  return NextResponse.json({ event }, { status: 201 })
}
