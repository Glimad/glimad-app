import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resetMonthlyStreakFreezes } from '@/lib/gamification'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Add 20 energy to all active projects (capped at 100)
  const { data: projects } = await admin
    .from('projects')
    .select('id, energy')
    .neq('status', 'archived')

  if (projects) {
    for (const project of projects) {
      const newEnergy = Math.min(100, (project.energy ?? 0) + 20)
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
