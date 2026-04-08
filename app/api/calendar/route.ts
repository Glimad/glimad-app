import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()
  if (!project) return NextResponse.json({ error: 'No project' }, { status: 404 })

  const start = month
    ? `${month}-01T00:00:00Z`
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const end = month
    ? new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0, 23, 59, 59).toISOString()
    : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).toISOString()

  const selectFields = 'id, content_type, platform, status, scheduled_at, created_at, asset_id, output_id, core_assets(content), core_outputs(content)'

  const { data: scheduledItems } = await admin
    .from('core_calendar_items')
    .select(selectFields)
    .eq('project_id', project.id)
    .gte('scheduled_at', start)
    .lte('scheduled_at', end)
    .order('scheduled_at', { ascending: true })

  const { data: draftItems } = await admin
    .from('core_calendar_items')
    .select(selectFields)
    .eq('project_id', project.id)
    .eq('status', 'draft')
    .is('scheduled_at', null)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    items: scheduledItems ?? [],
    drafts: draftItems ?? [],
  })
}
