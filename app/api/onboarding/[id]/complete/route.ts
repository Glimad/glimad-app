import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { sanitizeText, sanitizeHandle } from '@/lib/security/sanitize'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const raw = body.final_responses ?? {}

  // Sanitize all string fields in responses
  const final_responses: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key.includes('handle') || key.includes('url') || key.includes('platform')) {
      final_responses[key] = sanitizeHandle(value)
    } else if (typeof value === 'string') {
      final_responses[key] = sanitizeText(value, 500)
    } else {
      final_responses[key] = value
    }
  }
  const admin = createAdminClient()

  const { data: session } = await admin
    .from('onboarding_sessions')
    .select('started_at, responses_json')
    .eq('id', params.id)
    .single()

  const completedAt = new Date()
  const startedAt = new Date(session!.started_at)
  const timeToComplete = Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)

  const mergedResponses = { ...session!.responses_json, ...final_responses }

  // Determine experiment_variant from journey_stage (new flow) or platform_current (legacy fallback)
  const journeyStage = mergedResponses['journey_stage'] as string | undefined
  const experimentVariant = journeyStage === 'existing'
    ? 'B_has_presence'
    : journeyStage === 'legacy'
    ? 'C_legacy_builder'
    : 'A_zero_start'

  await admin
    .from('onboarding_sessions')
    .update({
      responses_json: mergedResponses,
      experiment_variant: experimentVariant,
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
