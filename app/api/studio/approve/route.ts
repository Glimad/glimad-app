import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { appendSignal } from '@/lib/brain'

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content_type, topic, content, scheduled_at } = await request.json()
  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  const projectId = project!.id

  const { data: asset } = await admin
    .from('core_assets')
    .insert({
      project_id: projectId,
      asset_type: 'content_piece',
      content: { content_type, topic, ...content },
    })
    .select('id')
    .single()

  const { data: calendarItem } = await admin
    .from('core_calendar_items')
    .insert({
      project_id: projectId,
      asset_id: asset!.id,
      content_type,
      platform: content.platform ?? null,
      scheduled_at: scheduled_at ?? null,
      status: scheduled_at ? 'scheduled' : 'draft',
    })
    .select('id')
    .single()

  await appendSignal(admin, projectId, 'content_created', {
    content_type,
    topic,
    asset_id: asset!.id,
    calendar_item_id: calendarItem!.id,
  })

  return NextResponse.json({ asset_id: asset!.id, calendar_item_id: calendarItem!.id })
}
