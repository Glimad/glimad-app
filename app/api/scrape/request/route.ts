import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { requestScrapeLight } from '@/lib/scrape'

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects')
    .select('id, focus_platform, focus_platform_handle')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  if (!project?.focus_platform || !project?.focus_platform_handle) {
    return NextResponse.json({ error: 'No focus platform configured' }, { status: 400 })
  }

  const result = await requestScrapeLight(
    admin,
    project.id,
    user.id,
    project.focus_platform,
    project.focus_platform_handle
  )

  return NextResponse.json(result)
}
