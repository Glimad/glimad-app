import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { resumeMissionAfterInput } from '@/lib/missions/runner'

export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const inputs = await req.json()
  const locale = req.cookies.get('NEXT_LOCALE')?.value ?? 'en'
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
    .select('id')
    .eq('id', params.id)
    .eq('project_id', project.id)
    .single()
  if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await resumeMissionAfterInput(admin, params.id, inputs, locale)

  return NextResponse.json({ status: 'completed' })
}
