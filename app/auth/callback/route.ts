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
  let user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null = null;
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
    const sid =
      (user.user_metadata?.onboarding_session_id as string | null | undefined) ??
      null;

    const { data: existing } = await admin
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .neq("status", "archived")
      .single();

    if (!existing) {
      await admin.from("projects").insert({
        user_id: user.id,
        name:
          (user.user_metadata?.full_name as string | undefined) ??
          user.email ??
          "My Project",
        status: "created",
        phase_code: "F0",
        onboarding_session_id: sid,
      });
    }

    if (sid) {
      await admin
        .from("onboarding_sessions")
        .update({ converted_to_user_id: user.id, status: "completed" })
        .eq("id", sid);
    }

    if (existing) {
      const { data: activeSub } = await admin
        .from("core_subscriptions")
        .select("id")
        .eq("project_id", existing.id)
        .eq("status", "active")
        .single();

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
