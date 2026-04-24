import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/stripe/webhook")) return NextResponse.next();
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon.ico"))
    return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.next();
  if (pathname.includes("/auth/callback")) return NextResponse.next();

  // Public, pre-auth paths. /onboarding is NOT public anymore — it requires
  // an authenticated user (web flow: signup → onboarding → subscribe).
  const publicPaths = [
    "/login",
    "/signup",
    "/verify",
    "/terms",
    "/privacy",
  ];
  if (publicPaths.some((p) => pathname.startsWith(p)))
    return NextResponse.next();

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const [{ data: completedSession }, { data: project }] = await Promise.all([
    admin
      .from("onboarding_sessions")
      .select("id")
      .eq("converted_to_user_id", user.id)
      .eq("status", "completed")
      .limit(1)
      .maybeSingle(),
    admin
      .from("projects")
      .select("id, status, is_admin")
      .eq("user_id", user.id)
      .neq("status", "archived")
      .maybeSingle(),
  ]);

  const hasCompletedOnboarding = !!completedSession;

  let hasActiveSubscription = false;
  if (project) {
    const { data: subs } = await admin
      .from("core_subscriptions")
      .select("id")
      .eq("project_id", project.id)
      .eq("status", "active")
      .limit(1);
    hasActiveSubscription = (subs?.length ?? 0) > 0;
  }

  // State-based routing. Each gate sends users forward, never backward.
  if (pathname.startsWith("/onboarding")) {
    if (hasCompletedOnboarding && hasActiveSubscription) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (hasCompletedOnboarding) {
      return NextResponse.redirect(new URL("/subscribe", request.url));
    }
    return supabaseResponse;
  }

  if (pathname.startsWith("/subscribe")) {
    if (!hasCompletedOnboarding) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
    if (hasActiveSubscription) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return supabaseResponse;
  }

  // All other authenticated routes require full completion.
  if (!hasCompletedOnboarding) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }
  if (!hasActiveSubscription) {
    return NextResponse.redirect(new URL("/subscribe", request.url));
  }

  if (pathname.startsWith("/admin") && !project?.is_admin) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
