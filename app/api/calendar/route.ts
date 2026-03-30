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

  const start = month
    ? `${month}-01T00:00:00Z`
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const end = month
    ? new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0, 23, 59, 59).toISOString()
    : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).toISOString()

  const { data: items } = await admin
    .from('core_calendar_items')
    .select('id, content_type, platform, state, scheduled_at, created_at, asset_id, core_assets(content)')
    .eq('project_id', project!.id)
    .gte('scheduled_at', start)
    .lte('scheduled_at', end)
    .order('scheduled_at', { ascending: true })

  return NextResponse.json({ items: items ?? [] })
}
