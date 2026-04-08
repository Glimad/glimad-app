import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidTransition, updateCalendarItem, deleteCalendarItem } from '@/lib/calendar'

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
  if (!project) return NextResponse.json({ error: 'No project' }, { status: 404 })

  if (body.status) {
    const { data: current } = await admin
      .from('core_calendar_items')
      .select('status')
      .eq('id', params.id)
      .eq('project_id', project.id)
      .single()

    if (current && !isValidTransition(current.status, body.status)) {
      return NextResponse.json(
        { error: `Cannot transition from ${current.status} to ${body.status}` },
        { status: 422 },
      )
    }
  }

  const fields: Record<string, unknown> = {}
  if (body.scheduled_at !== undefined) fields.scheduled_at = body.scheduled_at

  const item = await updateCalendarItem(admin, project.id, params.id, body.status, fields)
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
  if (!project) return NextResponse.json({ error: 'No project' }, { status: 404 })

  await deleteCalendarItem(admin, project.id, params.id)
  return NextResponse.json({ success: true })
}
