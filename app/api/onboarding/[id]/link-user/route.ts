import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { user_id } = await request.json()
  if (!user_id || typeof user_id !== 'string') {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
  }

  // Validate the caller owns this session via the cookie
  const cookie = request.headers.get('cookie') ?? ''
  const sidMatch = cookie.match(/(?:^|;\s*)glimad_onboarding_sid=([^;]+)/)
  const cookieSid = sidMatch?.[1]
  if (!cookieSid || cookieSid !== params.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Verify session exists and is completed
  const { data: session } = await admin
    .from('onboarding_sessions')
    .select('id, status')
    .eq('id', params.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Explicitly link user to onboarding session — do not rely on triggers
  await admin
    .from('onboarding_sessions')
    .update({
      converted_to_user_id: user_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)

  return NextResponse.json({ success: true })
}
