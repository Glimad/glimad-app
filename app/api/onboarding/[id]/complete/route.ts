import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { sanitizeText, sanitizeHandle } from '@/lib/security/sanitize'
import { getAuthUser } from '@/lib/supabase/extract-token'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getAuthUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    .select('started_at, responses_json, converted_to_user_id')
    .eq('id', params.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.converted_to_user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const completedAt = new Date()
  const startedAt = new Date(session.started_at)
  const timeToComplete = Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)

  const mergedResponses = { ...session.responses_json, ...final_responses }

  // Determine experiment_variant by SOCIAL platform presence.
  // Website is a conversion channel, not a measurable social audience — exclude it
  // so website-only users are not classified as 'has_presence'.
  const selectedPlatforms = mergedResponses['selected_platforms']
  const noPresence = Boolean(mergedResponses['no_presence'])
  const socialPlatforms = Array.isArray(selectedPlatforms)
    ? (selectedPlatforms as unknown[]).filter((p) => {
        const s = String(p ?? '').toLowerCase().trim()
        return s && !s.includes('website') && !s.includes('sitio web')
      })
    : []
  const hasSocialPresence = socialPlatforms.length > 0 && !noPresence
  const experimentVariant = hasSocialPresence ? 'B_has_presence' : 'A_zero_start'

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
