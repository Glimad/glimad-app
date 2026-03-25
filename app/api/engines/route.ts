// POST /api/engines — runs Phase Engine + Inflexion Engine + Policy Engine
// Returns: phase, capability score, recommended mission, active mode
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runPhaseEngine } from '@/lib/engines/phase-engine'
import { runInflexionEngine } from '@/lib/engines/inflexion-engine'
import { runPolicyEngine } from '@/lib/engines/policy-engine'

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  if (!project) return NextResponse.json({ error: 'No project found' }, { status: 404 })

  const phaseResult = await runPhaseEngine(admin, project.id)
  const inflexion = await runInflexionEngine(admin, project.id)
  const policy = await runPolicyEngine(admin, project.id, phaseResult, inflexion)

  return NextResponse.json({ phaseResult, inflexion, policy })
}
