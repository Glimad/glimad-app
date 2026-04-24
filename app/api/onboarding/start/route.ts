import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { checkAuthRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { getAuthUser } from '@/lib/supabase/extract-token'

export async function POST(request: Request) {
  if (!checkAuthRateLimit(getClientIp(request))) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const user = await getAuthUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { visitor_id } = body as { visitor_id?: string }

  const admin = createAdminClient()

  // If the user already has a completed onboarding, don't let them restart —
  // middleware should have redirected them, but guard here as well.
  const { data: completed } = await admin
    .from('onboarding_sessions')
    .select('id')
    .eq('converted_to_user_id', user.id)
    .eq('status', 'completed')
    .limit(1)
    .maybeSingle()

  if (completed) {
    return NextResponse.json(
      { error: 'Onboarding already completed' },
      { status: 409 },
    )
  }

  // User left mid-wizard previously — abandon the old in_progress row
  // so they restart from step 1 (per product decision).
  await admin
    .from('onboarding_sessions')
    .delete()
    .eq('converted_to_user_id', user.id)
    .eq('status', 'in_progress')

  const { data: session, error } = await admin
    .from('onboarding_sessions')
    .insert({
      visitor_id: visitor_id ?? null,
      converted_to_user_id: user.id,
      experiment_variant: null,
      step_current: 1,
      step_total: 12,
      status: 'in_progress',
      started_at: new Date().toISOString(),
      responses_json: {},
    })
    .select('id')
    .single()

  if (error || !session) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to create session' },
      { status: 500 },
    )
  }

  return NextResponse.json({ onboarding_session_id: session.id })
}
