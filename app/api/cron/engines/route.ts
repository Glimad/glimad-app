// Hourly Phase Engine + Policy Engine refresh (per spec Step 10: "1×/hour via cron")
// For each active project: run Phase Engine → run Policy Engine → instantiate new missions if needed.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runPhaseEngine } from '@/lib/engines/phase-engine'
import { runInflexionEngine } from '@/lib/engines/inflexion-engine'
import { runPolicyEngine } from '@/lib/engines/policy-engine'
import { createMissionInstance } from '@/lib/missions/runner'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: projects } = await admin
    .from('projects')
    .select('id')
    .neq('status', 'archived')

  let processed = 0
  for (const project of projects ?? []) {
    const phaseResult = await runPhaseEngine(admin, project.id)
    const inflexion = await runInflexionEngine(admin, project.id)
    const policyResult = await runPolicyEngine(admin, project.id, phaseResult, inflexion)

    // Write active_mode
    await admin
      .from('projects')
      .update({ active_mode: policyResult.activeMode, updated_at: new Date().toISOString() })
      .eq('id', project.id)

    // Instantiate top recommended missions (idempotent)
    for (const m of policyResult.missionQueue.slice(0, 3)) {
      await createMissionInstance(admin, project.id, m.templateCode)
    }

    processed++
  }

  return NextResponse.json({ processed })
}
