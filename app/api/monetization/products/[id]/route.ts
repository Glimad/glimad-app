// GET /api/monetization/products/[id] — product detail + events + health score
// PUT /api/monetization/products/[id] — update product
// DELETE /api/monetization/products/[id] — archive (status → archived)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeProductHealth } from '@/lib/monetization'
import { getProjectId } from '@/lib/supabase/project'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
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

  const [productResult, eventsResult, health] = await Promise.all([
    admin.from('monetization_products').select('*').eq('id', params.id).eq('project_id', projectId).single(),
    admin.from('monetization_events').select('*').eq('product_id', params.id).order('event_date', { ascending: false }),
    computeProductHealth(admin, projectId, params.id),
  ])

  return NextResponse.json({
    product: productResult.data,
    events: eventsResult.data ?? [],
    health,
  })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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

  const { data: product } = await admin
    .from('monetization_products')
    .update({
      name: body.name,
      type: body.type,
      price_amount: body.price_amount,
      price_currency: body.price_currency,
      status: body.status,
      platform: body.platform,
      url: body.url,
      notes: body.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('project_id', projectId)
    .select()
    .single()

  return NextResponse.json({ product })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
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

  await admin
    .from('monetization_products')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('project_id', projectId)

  return NextResponse.json({ archived: true })
}
