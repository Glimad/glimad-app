import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/stripe/webhook')) return NextResponse.next()
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico')) return NextResponse.next()
  if (pathname.startsWith('/api/')) return NextResponse.next()
  if (pathname.includes('/auth/callback')) return NextResponse.next()

  const publicPaths = ['/login', '/signup', '/verify', '/onboarding', '/terms', '/privacy']
  if (publicPaths.some(p => pathname.startsWith(p))) return NextResponse.next()

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
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

  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: project } = await supabase
    .from('projects')
    .select('id, status, is_admin')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  if (!project) {
    if (pathname.startsWith('/subscribe')) return supabaseResponse
    return NextResponse.redirect(new URL('/subscribe', request.url))
  }

  const { data: subscriptions } = await supabase
    .from('core_subscriptions')
    .select('status')
    .eq('project_id', project.id)
    .eq('status', 'active')
    .limit(1)

  const subscription = subscriptions?.[0] ?? null

  if (!subscription) {
    if (pathname.startsWith('/subscribe')) return supabaseResponse
    return NextResponse.redirect(new URL('/subscribe', request.url))
  }

  if (pathname.startsWith('/admin') && !project.is_admin) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
