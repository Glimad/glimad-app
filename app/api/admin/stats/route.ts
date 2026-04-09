import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/extract-token";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Check admin role
  const { data: project } = await admin
    .from("projects")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  if (!project?.is_admin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── User overview ─────────────────────────────────────────────────────────
  const { count: totalUsers } = await admin
    .from("projects")
    .select("id", { count: "exact", head: true })
    .neq("status", "archived");

  const { count: completedOnboarding } = await admin
    .from("onboarding_sessions")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed");

  const { count: paidUsers } = await admin
    .from("core_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const { data: missionUsers } = await admin
    .from("mission_instances")
    .select("project_id")
    .eq("status", "completed");

  const usersWithMissions = new Set(
    missionUsers?.map((m) => m.project_id) ?? [],
  ).size;

  // ── Mission analytics ─────────────────────────────────────────────────────
  const { data: allMissionInstances } = await admin
    .from("mission_instances")
    .select("template_code, status, started_at, completed_at");

  const missionStats: Record<
    string,
    {
      total: number;
      completed: number;
      abandoned: number;
      totalMinutes: number;
    }
  > = {};

  for (const inst of allMissionInstances ?? []) {
    if (!missionStats[inst.template_code]) {
      missionStats[inst.template_code] = {
        total: 0,
        completed: 0,
        abandoned: 0,
        totalMinutes: 0,
      };
    }
    missionStats[inst.template_code].total++;
    if (inst.status === "completed") {
      missionStats[inst.template_code].completed++;
      if (inst.started_at && inst.completed_at) {
        const mins =
          (new Date(inst.completed_at).getTime() -
            new Date(inst.started_at).getTime()) /
          60000;
        missionStats[inst.template_code].totalMinutes += mins;
      }
    }
    if (inst.status === "waiting_input") {
      missionStats[inst.template_code].abandoned++;
    }
  }

  const missionAnalytics = Object.entries(missionStats)
    .map(([code, s]) => ({
      template_code: code,
      total: s.total,
      completed: s.completed,
      completion_rate:
        s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
      abandoned: s.abandoned,
      avg_minutes:
        s.completed > 0 ? Math.round(s.totalMinutes / s.completed) : null,
    }))
    .sort((a, b) => b.total - a.total);

  // ── Credit consumption ────────────────────────────────────────────────────
  const { data: ledgerRows } = await admin
    .from("core_ledger")
    .select("reason_key, amount_allowance, amount_premium, project_id")
    .eq("kind", "debit")
    .order("created_at", { ascending: false })
    .limit(1000);

  const reasonTotals: Record<
    string,
    { allowance: number; premium: number; count: number }
  > = {};
  for (const row of ledgerRows ?? []) {
    if (!reasonTotals[row.reason_key]) {
      reasonTotals[row.reason_key] = { allowance: 0, premium: 0, count: 0 };
    }
    reasonTotals[row.reason_key].count++;
    reasonTotals[row.reason_key].allowance += Math.abs(
      row.amount_allowance ?? 0,
    );
    reasonTotals[row.reason_key].premium += Math.abs(row.amount_premium ?? 0);
  }

  const creditConsumption = Object.entries(reasonTotals)
    .map(([key, v]) => ({ reason_key: key, ...v }))
    .sort((a, b) => b.count - a.count);

  // ── A/B test results ──────────────────────────────────────────────────────
  const { data: experiments } = await admin
    .from("experiments")
    .select("id, name, status, start_date")
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: onboardingSessions } = await admin
    .from("onboarding_sessions")
    .select("experiment_variant, status, converted_to_user_id");

  const variantStats: Record<string, { total: number; converted: number }> = {};
  for (const s of onboardingSessions ?? []) {
    const v = s.experiment_variant ?? "unknown";
    if (!variantStats[v]) variantStats[v] = { total: 0, converted: 0 };
    variantStats[v].total++;
    if (s.converted_to_user_id) variantStats[v].converted++;
  }

  const abResults = Object.entries(variantStats).map(([variant, s]) => ({
    variant,
    total: s.total,
    converted: s.converted,
    conversion_rate:
      s.total > 0 ? Math.round((s.converted / s.total) * 100) : 0,
  }));

  // ── Feature flags ─────────────────────────────────────────────────────────
  const { data: featureFlags } = await admin
    .from("feature_flags")
    .select("*")
    .is("project_id", null)
    .order("flag_key");

  // ── Error log ─────────────────────────────────────────────────────────────
  const { data: failedMissions } = await admin
    .from("mission_instances")
    .select("id, template_code, project_id, created_at, outputs")
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    userOverview: {
      total: totalUsers ?? 0,
      completedOnboarding: completedOnboarding ?? 0,
      paid: paidUsers ?? 0,
      withMissions: usersWithMissions,
    },
    missionAnalytics,
    creditConsumption,
    abResults,
    experiments: experiments ?? [],
    featureFlags: featureFlags ?? [],
    errorLog: failedMissions ?? [],
  });
}

export async function PATCH(request: Request) {
  const user = await getAuthUser(request);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: project } = await admin
    .from("projects")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  if (!project?.is_admin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { flag_key, enabled } = await request.json();

  await admin
    .from("feature_flags")
    .upsert(
      {
        flag_key,
        enabled,
        project_id: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "flag_key,project_id" },
    );

  return NextResponse.json({ ok: true });
}
