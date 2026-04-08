import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resetMonthlyStreakFreezes } from '@/lib/gamification'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Deplete 10 energy per day (floor = 0) per spec Step 16
  const { data: projects } = await admin
    .from('projects')
    .select('id, energy')
    .neq('status', 'archived')

  if (projects) {
    for (const project of projects) {
      const newEnergy = Math.max(0, (project.energy ?? 0) - 10)
      await admin.from('projects').update({ energy: newEnergy }).eq('id', project.id)
    }
  }

  // Reset streak freezes on first day of month
  const today = new Date()
  if (today.getDate() === 1 && projects) {
    for (const project of projects) {
      await resetMonthlyStreakFreezes(admin, project.id)
    }
  }

  return NextResponse.json({ ok: true })
}
