import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { final_responses } = await request.json()
  const admin = createAdminClient()

  const { data: session } = await admin
    .from('onboarding_sessions')
    .select('started_at, responses_json')
    .eq('id', params.id)
    .single()

  const completedAt = new Date()
  const startedAt = new Date(session!.started_at)
  const timeToComplete = Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)

  await admin
    .from('onboarding_sessions')
    .update({
      responses_json: { ...session!.responses_json, ...final_responses },
      status: 'completed',
      completed_at: completedAt.toISOString(),
      time_to_complete_seconds: timeToComplete,
      updated_at: completedAt.toISOString(),
    })
    .eq('id', params.id)

  return NextResponse.json({
    success: true,
    onboarding_session_id: params.id,
    ready_for_signup: true,
  })
}
