import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: instance } = await admin
    .from('mission_instances')
    .select('*, mission_templates(name, description, type, steps_json)')
    .eq('id', params.id)
    .single()

  if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: steps } = await admin
    .from('mission_steps')
    .select('*')
    .eq('mission_instance_id', params.id)
    .order('step_number', { ascending: true })

  return NextResponse.json({ instance, steps: steps ?? [] })
}
