import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { step, responses } = await request.json()
  const admin = createAdminClient()

  const { data: session } = await admin
    .from('onboarding_sessions')
    .select('responses_json, step_total')
    .eq('id', params.id)
    .single()

  const merged = { ...session!.responses_json, ...responses }

  await admin
    .from('onboarding_sessions')
    .update({
      responses_json: merged,
      step_current: step + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)

  return NextResponse.json({
    success: true,
    step_current: step + 1,
    step_total: session!.step_total,
    progress_pct: Math.round(((step + 1) / session!.step_total) * 100),
  })
}
