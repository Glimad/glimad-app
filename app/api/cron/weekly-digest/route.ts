// Cron: Monday 09:00 UTC — sends weekly growth digest to all active projects
// Must be called with Authorization: Bearer $CRON_SECRET

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWeeklyDigests } from '@/lib/notifications'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  await sendWeeklyDigests(admin)

  return NextResponse.json({ ok: true })
}
