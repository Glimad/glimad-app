import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const cookie = request.headers.get('cookie') ?? ''
  const sidMatch = cookie.match(/(?:^|;\s*)glimad_onboarding_sid=([^;]+)/)
  const cookieSid = sidMatch?.[1]
  if (!cookieSid || cookieSid !== params.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { step, responses } = await request.json()
  const admin = createAdminClient()

  const { data: session } = await admin
    .from('onboarding_sessions')
    .select('responses_json, step_total')
    .eq('id', params.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const merged = { ...session.responses_json, ...responses }

  await admin
    .from('onboarding_sessions')
    .update({
      responses_json: merged,
      step_current: step,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)

  return NextResponse.json({
    success: true,
    step_current: step,
    step_total: session.step_total,
    progress_pct: Math.round((step / session.step_total) * 100),
  })
}
