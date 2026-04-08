import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/extract-token'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  if (!project) return NextResponse.json({ error: 'No project' }, { status: 404 })

  const { data: instance } = await admin
    .from('mission_instances')
    .select('*, mission_templates(name, description, type, steps_json)')
    .eq('id', params.id)
    .eq('project_id', project.id)
    .single()

  if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: steps } = await admin
    .from('mission_steps')
    .select('*')
    .eq('mission_instance_id', params.id)
    .order('step_number', { ascending: true })

  return NextResponse.json({ instance, steps: steps ?? [] })
}
