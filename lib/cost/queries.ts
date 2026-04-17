/**
 * lib/cost/queries.ts
 * Brief 29: Developer Cost Tracking & Validation
 *
 * Analytics queries over `dev_cost_log` to validate Finance model assumptions.
 * All queries use the admin (service_role) client and scope to a recent window.
 *
 * Finance model thresholds (from spec § 2):
 *   BASE plan (€29/mo): COGS target ≤ €16.45  →  go/no-go alert at €14
 *   PRO  plan (€59/mo): COGS target ≤ €20
 *   ELITE plan (€129/mo): COGS target ≤ €40
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CostAlert,
  CostSummary,
  OperationCostStats,
  PlanCogsSummary,
  RetryRateStats,
} from "./types";

// Finance model COGS thresholds from spec § 6
const COGS_THRESHOLDS: Record<string, { warn: number; critical: number }> = {
  starter: { warn: 12, critical: 14 },
  growth: { warn: 18, critical: 22 },
  scale: { warn: 35, critical: 45 },
};

// ============================================================================
// INDIVIDUAL QUERIES
// ============================================================================

/**
 * Average, min, max cost per operation over the past N days.
 * Matches spec § 5 "Coste promedio por operación".
 */
export async function getCostByOperation(
  admin: SupabaseClient,
  periodDays = 30,
): Promise<OperationCostStats[]> {
  const since = new Date(Date.now() - periodDays * 86_400_000).toISOString();

  const { data, error } = await admin
    .from("dev_cost_log")
    .select(
      "operation_type, cost_eur, duration_ms, tokens_input, tokens_output, tokens_total",
    )
    .gte("created_at", since)
    .eq("success", true);

  if (error || !data) return [];

  type Row = {
    operation_type: string;
    cost_eur: number;
    duration_ms: number | null;
    tokens_total: number | null;
  };

  const grouped: Record<string, Row[]> = {};
  for (const row of data as Row[]) {
    (grouped[row.operation_type] ??= []).push(row);
  }

  return Object.entries(grouped).map(([op, rows]) => {
    const costs = rows.map((r) => r.cost_eur);
    const total = costs.reduce((s, c) => s + c, 0);
    const avg = total / costs.length;
    const variance =
      costs.reduce((s, c) => s + (c - avg) ** 2, 0) / costs.length;

    const durations = rows
      .map((r) => r.duration_ms)
      .filter((d): d is number => d !== null);
    const tokens = rows
      .map((r) => r.tokens_total)
      .filter((t): t is number => t !== null);

    return {
      operation_type: op,
      total_ops: rows.length,
      avg_cost_eur: round(avg, 6),
      min_cost_eur: round(Math.min(...costs), 6),
      max_cost_eur: round(Math.max(...costs), 6),
      total_cost_eur: round(total, 4),
      stddev_cost: round(Math.sqrt(variance), 6),
      avg_duration_ms:
        durations.length > 0
          ? round(durations.reduce((s, d) => s + d, 0) / durations.length, 0)
          : null,
      avg_tokens_total:
        tokens.length > 0
          ? round(tokens.reduce((s, t) => s + t, 0) / tokens.length, 0)
          : null,
    };
  });
}

/**
 * COGS breakdown per plan, scoped to distinct users in the period.
 * Approximates "real COGS per user/month" from spec § 2 and § 5.
 */
export async function getCogsByPlan(
  admin: SupabaseClient,
  periodDays = 30,
): Promise<PlanCogsSummary[]> {
  const since = new Date(Date.now() - periodDays * 86_400_000).toISOString();

  const { data, error } = await admin
    .from("dev_cost_log")
    .select("plan_code, user_id, cost_eur")
    .gte("created_at", since)
    .eq("success", true);

  if (error || !data) return [];

  type Row = {
    plan_code: string | null;
    user_id: string | null;
    cost_eur: number;
  };

  const grouped: Record<string, Row[]> = {};
  for (const row of data as Row[]) {
    const key = row.plan_code ?? "unknown";
    (grouped[key] ??= []).push(row);
  }

  return Object.entries(grouped).map(([planCode, rows]) => {
    const totalCost = rows.reduce((s, r) => s + r.cost_eur, 0);
    const uniqueUsers = new Set(rows.map((r) => r.user_id).filter(Boolean))
      .size;

    return {
      plan_code: planCode === "unknown" ? null : planCode,
      total_users: uniqueUsers,
      total_ops: rows.length,
      total_cost_eur: round(totalCost, 4),
      avg_cost_per_user_eur:
        uniqueUsers > 0 ? round(totalCost / uniqueUsers, 2) : 0,
      avg_cost_per_op_eur:
        rows.length > 0 ? round(totalCost / rows.length, 6) : 0,
    };
  });
}

/**
 * Retry and failure rates per operation.
 * Matches spec § 5 "Tasa de retries por operación".
 */
export async function getRetryRates(
  admin: SupabaseClient,
  periodDays = 30,
): Promise<RetryRateStats[]> {
  const since = new Date(Date.now() - periodDays * 86_400_000).toISOString();

  const { data, error } = await admin
    .from("dev_cost_log")
    .select("operation_type, retry_count")
    .gte("created_at", since);

  if (error || !data) return [];

  type Row = { operation_type: string; retry_count: number };

  const grouped: Record<string, Row[]> = {};
  for (const row of data as Row[]) {
    (grouped[row.operation_type] ??= []).push(row);
  }

  return Object.entries(grouped).map(([op, rows]) => {
    const retried = rows.filter((r) => r.retry_count > 0);
    const avgRetries =
      retried.length > 0
        ? retried.reduce((s, r) => s + r.retry_count, 0) / retried.length
        : 0;

    return {
      operation_type: op,
      total_jobs: rows.length,
      retried_jobs: retried.length,
      retry_rate_pct: round((retried.length / rows.length) * 100, 2),
      avg_retries: round(avgRetries, 2),
    };
  });
}

/**
 * Top-N most expensive individual operations.
 * Matches spec § 5 "Top 10 operaciones más caras".
 */
export async function getTopExpensiveOps(
  admin: SupabaseClient,
  limit = 10,
  periodDays = 30,
): Promise<
  Pick<
    import("./types").CostLogRow,
    | "operation_type"
    | "cost_eur"
    | "duration_ms"
    | "tokens_input"
    | "tokens_output"
    | "provider"
    | "model"
    | "created_at"
  >[]
> {
  const since = new Date(Date.now() - periodDays * 86_400_000).toISOString();

  const { data, error } = await admin
    .from("dev_cost_log")
    .select(
      "operation_type, cost_eur, duration_ms, tokens_input, tokens_output, provider, model, created_at",
    )
    .gte("created_at", since)
    .eq("success", true)
    .order("cost_eur", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data;
}

// ============================================================================
// GO/NO-GO ALERTS
// ============================================================================

/**
 * Compare actual COGS per user against Finance model thresholds.
 * Returns alerts for each plan that breaches warn/critical levels.
 */
export function buildCostAlerts(
  byPlan: PlanCogsSummary[],
  periodDays: number,
): CostAlert[] {
  const alerts: CostAlert[] = [];

  // Scale to monthly if period_days != 30
  const scaleFactor = 30 / periodDays;

  for (const plan of byPlan) {
    if (!plan.plan_code) continue;
    const threshold = COGS_THRESHOLDS[plan.plan_code];
    if (!threshold || plan.total_users === 0) continue;

    const monthlyEstimate = plan.avg_cost_per_user_eur * scaleFactor;

    if (monthlyEstimate > threshold.critical) {
      alerts.push({
        level: "critical",
        message: `Plan ${plan.plan_code.toUpperCase()}: estimated COGS €${monthlyEstimate.toFixed(2)}/user/month exceeds critical threshold €${threshold.critical} — DO NOT LAUNCH until optimized`,
        threshold_eur: threshold.critical,
        actual_eur: monthlyEstimate,
      });
    } else if (monthlyEstimate > threshold.warn) {
      alerts.push({
        level: "warn",
        message: `Plan ${plan.plan_code.toUpperCase()}: estimated COGS €${monthlyEstimate.toFixed(2)}/user/month above warn threshold €${threshold.warn} — launch with strict monitoring`,
        threshold_eur: threshold.warn,
        actual_eur: monthlyEstimate,
      });
    } else {
      alerts.push({
        level: "ok",
        message: `Plan ${plan.plan_code.toUpperCase()}: estimated COGS €${monthlyEstimate.toFixed(2)}/user/month within target`,
        threshold_eur: threshold.warn,
        actual_eur: monthlyEstimate,
      });
    }
  }

  return alerts;
}

// ============================================================================
// FULL SUMMARY REPORT
// ============================================================================

/**
 * Aggregate all analytics into a single CostSummary report.
 * Use this for the /api/cost endpoint and finance reporting.
 */
export async function getCostSummary(
  admin: SupabaseClient,
  periodDays = 30,
): Promise<CostSummary> {
  const since = new Date(Date.now() - periodDays * 86_400_000).toISOString();

  // Fetch totals in parallel
  const [byOp, byPlan, retryStats] = await Promise.all([
    getCostByOperation(admin, periodDays),
    getCogsByPlan(admin, periodDays),
    getRetryRates(admin, periodDays),
  ]);

  // Aggregate totals
  const { data: totalsData } = await admin
    .from("dev_cost_log")
    .select("cost_eur, success")
    .gte("created_at", since);

  const rows = (totalsData ?? []) as { cost_eur: number; success: boolean }[];
  const totalCost = rows.reduce((s, r) => s + r.cost_eur, 0);
  const successCount = rows.filter((r) => r.success).length;

  const alerts = buildCostAlerts(byPlan, periodDays);

  return {
    period_days: periodDays,
    generated_at: new Date().toISOString(),
    total_cost_eur: round(totalCost, 4),
    total_ops: rows.length,
    success_rate_pct:
      rows.length > 0 ? round((successCount / rows.length) * 100, 2) : 100,
    top_operations: byOp
      .sort((a, b) => b.total_cost_eur - a.total_cost_eur)
      .slice(0, 10),
    by_plan: byPlan,
    retry_rates: retryStats,
    alerts,
  };
}

// ============================================================================
// UTILS
// ============================================================================

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
