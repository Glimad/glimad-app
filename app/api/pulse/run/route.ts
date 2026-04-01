import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { shouldRunPulse, runPulse } from '@/lib/pulse'

export const maxDuration = 60

export async function GET() {
  return Response.json({ v: 2 })
}

export async function POST(request: Request) {
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

  const canRun = await shouldRunPulse(admin, project.id)
  if (!canRun) {
    return NextResponse.json({ error: 'Rate limit: pulse ran less than 6 hours ago' }, { status: 429 })
  }

  const result = await runPulse(admin, project.id, 'manual')
  return NextResponse.json({ pulse: result })
}
