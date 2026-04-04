import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { appendSignal } from '@/lib/brain'

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['scheduled'],
  scheduled: ['published', 'paused', 'failed'],
  failed: ['scheduled'],
  paused: ['scheduled'],
  published: [],
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  const { data: current } = await admin
    .from('core_calendar_items')
    .select('status')
    .eq('id', params.id)
    .eq('project_id', project!.id)
    .single()

  if (body.status && current) {
    const allowed = VALID_TRANSITIONS[current.status] ?? []
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `Cannot transition from ${current.status} to ${body.status}` },
        { status: 422 },
      )
    }
  }

  const updates: Record<string, unknown> = {}
  if (body.status) updates.status = body.status
  if (body.scheduled_at !== undefined) updates.scheduled_at = body.scheduled_at

  const { data: item } = await admin
    .from('core_calendar_items')
    .update(updates)
    .eq('id', params.id)
    .eq('project_id', project!.id)
    .select()
    .single()

  if (body.status === 'published') {
    await appendSignal(admin, project!.id, 'content_published', {
      calendar_item_id: params.id,
      platform: item?.platform,
      date: new Date().toISOString(),
    })
  }

  return NextResponse.json({ item })
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  await admin
    .from('core_calendar_items')
    .delete()
    .eq('id', params.id)
    .eq('project_id', project!.id)

  return NextResponse.json({ success: true })
}
