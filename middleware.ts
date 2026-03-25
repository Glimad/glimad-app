import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Public routes — always accessible
  const publicRoutes = ['/login', '/signup', '/verify', '/auth/callback']
  if (publicRoutes.some(r => pathname.startsWith(r))) {
    return supabaseResponse
  }

  // Not authenticated → login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Check subscription status
  const { data: project } = await supabase
    .from('projects')
    .select('id, status')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  if (!project) {
    if (pathname.startsWith('/onboarding')) return supabaseResponse
    return NextResponse.redirect(new URL('/subscribe', request.url))
  }

  const { data: subscription } = await supabase
    .from('core_subscriptions')
    .select('status')
    .eq('project_id', project.id)
    .single()

  // No active subscription → subscribe
  if (!subscription || subscription.status !== 'active') {
    if (pathname.startsWith('/subscribe')) return supabaseResponse
    return NextResponse.redirect(new URL('/subscribe', request.url))
  }

  // Subscribed but onboarding not done → onboarding
  const { data: onboardingSession } = await supabase
    .from('onboarding_sessions')
    .select('status')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .single()

  if (!onboardingSession) {
    if (pathname.startsWith('/onboarding')) return supabaseResponse
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook).*)'],
}
