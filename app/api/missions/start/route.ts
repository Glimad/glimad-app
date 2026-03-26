import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { createMissionInstance, executeMission } from '@/lib/missions/runner'

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { template_code } = await req.json()

  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  if (!project) return NextResponse.json({ error: 'No project' }, { status: 404 })

  const instanceId = await createMissionInstance(admin, project.id, template_code)

  // Execute mission asynchronously (non-blocking for this request)
  executeMission(admin, instanceId).catch(() => {})

  return NextResponse.json({ instance_id: instanceId })
}
