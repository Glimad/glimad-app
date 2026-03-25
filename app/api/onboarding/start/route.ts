import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { TOTAL_STEPS } from '@/lib/onboarding/config'

export async function POST(request: Request) {
  const body = await request.json()
  const { visitor_id } = body

  const admin = createAdminClient()

  const { data: session } = await admin
    .from('onboarding_sessions')
    .insert({
      visitor_id: visitor_id ?? null,
      experiment_variant: 'control',
      step_current: 1,
      step_total: TOTAL_STEPS,
      status: 'in_progress',
      started_at: new Date().toISOString(),
      responses_json: {},
    })
    .select('id')
    .single()

  return NextResponse.json({ onboarding_session_id: session!.id })
}
