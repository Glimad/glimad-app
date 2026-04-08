import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { requestScrapeLight } from '@/lib/scrape'
import { readFact } from '@/lib/brain'

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
  if (!project) return NextResponse.json({ error: 'No project' }, { status: 404 })

  let platform = project?.focus_platform ?? null
  let handle = project?.focus_platform_handle ?? null
  if (!platform || !handle) {
    const focusFact = await readFact(admin, project.id, 'platforms.focus') as { platform?: string; handle?: string } | null
    platform = platform ?? focusFact?.platform ?? null
    handle = handle ?? focusFact?.handle ?? null
  }

  if (!platform || !handle) {
    return NextResponse.json({ error: 'No focus platform configured' }, { status: 400 })
  }

  const result = await requestScrapeLight(
    admin,
    project.id,
    user.id,
    platform,
    handle,
    'on_demand'
  )

  // Trigger worker immediately after queuing — don't wait for daily cron
  // Non-awaited: response returns to client while worker runs in a separate invocation
  if (result.job_id) {
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/scrape/run`, {
      headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
    }).catch(() => {})
  }

  return NextResponse.json(result)
}
