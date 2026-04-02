// GET /api/monetization/events — list revenue events for project
// POST /api/monetization/events — log revenue event (append-only)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProjectId } from '@/lib/supabase/project'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const admin = createAdminClient()
  const projectId = await getProjectId(req, admin)

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
  const projectId = await getProjectId(req, admin)

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
