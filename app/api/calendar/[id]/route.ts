import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { appendSignal } from '@/lib/brain'

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

  const updates: Record<string, unknown> = {}
  if (body.state) updates.state = body.state
  if (body.scheduled_at !== undefined) updates.scheduled_at = body.scheduled_at

  const { data: item } = await admin
    .from('core_calendar_items')
    .update(updates)
    .eq('id', params.id)
    .eq('project_id', project!.id)
    .select()
    .single()

  if (body.state === 'published') {
    await appendSignal(admin, project!.id, 'content_published', {
      calendar_item_id: params.id,
      platform: item?.platform,
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
