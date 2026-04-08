import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.exchangeCodeForSession(code)

    if (user) {
      const admin = createAdminClient()
      const sid = user.user_metadata?.onboarding_session_id ?? null

      const { data: existing } = await admin
        .from('projects')
        .select('id')
        .eq('user_id', user.id)
        .neq('status', 'archived')
        .single()

      if (!existing) {
        await admin.from('projects').insert({
          user_id: user.id,
          name: user.user_metadata?.full_name ?? user.email ?? 'My Project',
          status: 'created',
          phase_code: 'F0',
          onboarding_session_id: sid,
        })
      }

      if (sid) {
        await admin
          .from('onboarding_sessions')
          .update({ converted_to_user_id: user.id, status: 'completed' })
          .eq('id', sid)
      }

      // If already subscribed (re-verify or second login), go straight to dashboard
      if (existing) {
        const { data: activeSub } = await admin
          .from('core_subscriptions')
          .select('id')
          .eq('project_id', existing.id)
          .eq('status', 'active')
          .single()

        if (activeSub) {
          return NextResponse.redirect(`${origin}/dashboard`)
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}/subscribe`)
}
