import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const sessionId = searchParams.get('sid')

  if (code) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.exchangeCodeForSession(code)

    if (user) {
      const admin = createAdminClient()

      // Create project row if it doesn't exist yet
      const { data: existing } = await admin
        .from('projects')
        .select('id')
        .eq('user_id', user.id)
        .neq('status', 'archived')
        .single()

      if (!existing) {
        await admin.from('projects').insert({
          user_id: user.id,
          name: user.email ?? 'My Project',
          status: 'created',
          phase_code: 'F0',
          onboarding_session_id: sessionId ?? user.user_metadata?.onboarding_session_id ?? null,
        })
      }

      // Link onboarding session to user
      const sid = sessionId ?? user.user_metadata?.onboarding_session_id
      if (sid) {
        await admin
          .from('onboarding_sessions')
          .update({ converted_to_user_id: user.id })
          .eq('id', sid)
      }
    }
  }

  return NextResponse.redirect(`${origin}/es/subscribe`)
}
