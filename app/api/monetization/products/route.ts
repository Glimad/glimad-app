// GET /api/monetization/products — list products for project
// POST /api/monetization/products — create product

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { appendSignal } from '@/lib/brain'
import { getAuthUser } from '@/lib/supabase/extract-token'

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()
  const projectId = project!.id

  let query = admin
    .from('monetization_products')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data } = await query
  return NextResponse.json({ products: data ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()
  const projectId = project!.id

  const { data: product } = await admin
    .from('monetization_products')
    .insert({
      project_id: projectId,
      name: body.name,
      type: body.type,
      price_amount: body.price_amount ?? null,
      price_currency: body.price_currency ?? process.env.DEFAULT_CURRENCY ?? 'EUR',
      status: body.status ?? 'active',
      platform: body.platform ?? null,
      url: body.url ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single()

  await appendSignal(admin, projectId, 'product_created', { product_id: product?.id, type: body.type }, 'user')

  return NextResponse.json({ product }, { status: 201 })
}
