import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = createClient();
  let user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
  } | null = null;
  let authError: string | null = null;

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    user = data.user ?? null;
    if (error) authError = error.message;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    user = data.user ?? null;
    if (error) authError = error.message;
  }

  if (user) {
    const admin = createAdminClient();

    // Ensure a project row exists. In the new web flow onboarding has NOT been
    // completed yet at this point, so we don't link an onboarding_session_id —
    // that's attached later when the user starts the wizard.
    const { data: existing } = await admin
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .neq("status", "archived")
      .maybeSingle();

    let projectId = existing?.id ?? null;
    if (!projectId) {
      const { data: inserted } = await admin
        .from("projects")
        .insert({
          user_id: user.id,
          name:
            (user.user_metadata?.full_name as string | undefined) ??
            user.email ??
            "My Project",
          status: "created",
          phase_code: "F0",
        })
        .select("id")
        .single();
      projectId = inserted?.id ?? null;
    }

    // Route by state: onboarding → subscribe → dashboard.
    const { data: completedSession } = await admin
      .from("onboarding_sessions")
      .select("id")
      .eq("converted_to_user_id", user.id)
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();

    if (!completedSession) {
      return NextResponse.redirect(`${origin}/onboarding`);
    }

    if (projectId) {
      const { data: activeSub } = await admin
        .from("core_subscriptions")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (activeSub) {
        return NextResponse.redirect(`${origin}/dashboard`);
      }
    }

    return NextResponse.redirect(`${origin}/subscribe`);
  }

  console.error("[auth/callback] verification failed", {
    hasCode: !!code,
    hasTokenHash: !!tokenHash,
    type,
    authError,
  });

  const loginUrl = new URL(`${origin}/login`);
  loginUrl.searchParams.set("error", "verification_failed");
  return NextResponse.redirect(loginUrl);
}
