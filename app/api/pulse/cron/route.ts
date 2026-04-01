import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { shouldRunPulse, runPulse } from '@/lib/pulse'

export const maxDuration = 120

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: projects } = await admin
    .from('projects')
    .select('id')
    .neq('status', 'archived')

  if (!projects) return NextResponse.json({ ran: 0 })

  let ran = 0
  for (const project of projects) {
    const should = await shouldRunPulse(admin, project.id)
    if (should) {
      await runPulse(admin, project.id, 'schedule')
      ran++
    }
  }

  return NextResponse.json({ ran })
}
