import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { locales, defaultLocale } from './i18n.config'

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
})

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip Stripe webhook entirely
  if (pathname.startsWith('/api/stripe/webhook')) {
    return NextResponse.next()
  }

  // Skip Next.js internals and static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico')
  ) {
    return NextResponse.next()
  }

  // API routes: skip locale + auth middleware (except webhook already handled)
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Auth callback: skip locale handling
  if (pathname.includes('/auth/callback')) {
    return NextResponse.next()
  }

  // Run next-intl middleware first (handles locale detection + redirect)
  const intlResponse = intlMiddleware(request)

  // Extract locale from pathname (e.g. /es/login → es)
  const localeMatch = pathname.match(/^\/(es|en)(\/|$)/)
  const locale = localeMatch ? localeMatch[1] : defaultLocale

  // Public auth routes — allow through after locale handling
  const authPaths = [`/${locale}/login`, `/${locale}/signup`, `/${locale}/verify`, `/${locale}/onboarding`]
  if (authPaths.some(p => pathname.startsWith(p))) {
    return intlResponse
  }

  // If intl redirected (e.g. / → /es), let it through
  if (intlResponse.status === 307 || intlResponse.status === 308) {
    return intlResponse
  }

  // Auth check
  let supabaseResponse = intlResponse

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

  // Not authenticated → onboarding (canonical entry point for new visitors)
  if (!user) {
    return NextResponse.redirect(new URL(`/${locale}/onboarding`, request.url))
  }

  // Check subscription
  const { data: project } = await supabase
    .from('projects')
    .select('id, status')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  if (!project) {
    if (pathname.startsWith(`/${locale}/subscribe`)) return supabaseResponse
    return NextResponse.redirect(new URL(`/${locale}/subscribe`, request.url))
  }

  const { data: subscriptions } = await supabase
    .from('core_subscriptions')
    .select('status')
    .eq('project_id', project.id)
    .eq('status', 'active')
    .limit(1)

  const subscription = subscriptions?.[0] ?? null

  if (!subscription) {
    if (pathname.startsWith(`/${locale}/subscribe`)) return supabaseResponse
    return NextResponse.redirect(new URL(`/${locale}/subscribe`, request.url))
  }

  // Check onboarding
  const { data: onboardingSession } = await supabase
    .from('onboarding_sessions')
    .select('status')
    .eq('converted_to_user_id', user.id)
    .eq('status', 'completed')
    .single()

  if (!onboardingSession) {
    if (pathname.startsWith(`/${locale}/onboarding`)) return supabaseResponse
    return NextResponse.redirect(new URL(`/${locale}/onboarding`, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
