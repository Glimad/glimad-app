/**
 * lib/monitoring/slos.ts
 * Brief 31: Monitoring, SLOs & Incident Response
 *
 * SLI definitions and SLO evaluation against the live database.
 * Each SLO has an `evaluate()` function that queries Supabase
 * and returns the current measured value plus a pass/breach status.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// TYPES
// ============================================================================

export type SloStatus = "pass" | "breach" | "no_data";

export interface SloDefinition {
  /** Stable identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** What is being measured */
  description: string;
  /** Monitoring component / domain */
  component:
    | "auth"
    | "payments"
    | "brain"
    | "llm"
    | "missions"
    | "scraping"
    | "economy"
    | "infra";
  /** Target value — meaning depends on `comparison` */
  target: number;
  /** ">=" passes when measured >= target; "<=" passes when measured <= target */
  comparison: ">=" | "<=";
  /** Unit label for display (e.g. "%" or "ms") */
  unit: string;
  /** P0 / P1 / P2 — alert severity if this SLO breaches */
  severity: "P0" | "P1" | "P2" | "P3";
  /** Evaluation window in minutes */
  window_minutes: number;
  /**
   * Execute the SLO evaluation.
   * Returns null when there is no data for the window.
   */
  evaluate: (admin: SupabaseClient) => Promise<number | null>;
}

export interface SloResult {
  slo_id: string;
  name: string;
  component: string;
  status: SloStatus;
  measured: number | null;
  target: number;
  unit: string;
  severity: "P0" | "P1" | "P2" | "P3";
  window_minutes: number;
  evaluated_at: string;
}

// ============================================================================
// SLO DEFINITIONS (from spec § 3)
// ============================================================================

export const SLO_DEFINITIONS: SloDefinition[] = [
  // ── Auth ──────────────────────────────────────────────────────────────────
  // Login success rate is tracked via event_log; fall back to no_data
  // when event_log is not yet populated in dev.

  // ── Payments ──────────────────────────────────────────────────────────────
  {
    id: "payments.webhook_success_rate",
    name: "Stripe Webhook Success Rate",
    description: "Percentage of stripe_events that were processed successfully",
    component: "payments",
    target: 99.9,
    comparison: ">=",
    unit: "%",
    severity: "P0",
    window_minutes: 10,
    evaluate: async (admin) => {
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const { count: total } = await admin
        .from("stripe_events")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since);
      if (!total || total === 0) return null;
      const { count: processed } = await admin
        .from("stripe_events")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since)
        .eq("processed", true);
      return ((processed ?? 0) / total) * 100;
    },
  },

  // ── Brain ─────────────────────────────────────────────────────────────────
  {
    id: "brain.signal_write_success",
    name: "Brain Signal Write Success Rate",
    description:
      "Percentage of brain_signals rows written in the window (proxy: count > 0 = healthy)",
    component: "brain",
    target: 99.9,
    comparison: ">=",
    unit: "%",
    severity: "P1",
    window_minutes: 60,
    evaluate: async (admin) => {
      // brain_signals has no status column — we measure via core_jobs
      // job_type = 'brain_snapshot' success rate as a proxy.
      const since = new Date(Date.now() - 60 * 60_000).toISOString();
      const { count: total } = await admin
        .from("core_jobs")
        .select("*", { count: "exact", head: true })
        .eq("job_type", "brain_snapshot")
        .gte("created_at", since);
      if (!total || total === 0) return null;
      const { count: done } = await admin
        .from("core_jobs")
        .select("*", { count: "exact", head: true })
        .eq("job_type", "brain_snapshot")
        .eq("status", "done")
        .gte("created_at", since);
      return ((done ?? 0) / total) * 100;
    },
  },

  // ── Missions ──────────────────────────────────────────────────────────────
  {
    id: "missions.completion_rate",
    name: "Mission Completion Rate",
    description:
      "Percentage of instantiated missions that completed (not failed/cancelled) — last 60 min",
    component: "missions",
    target: 95,
    comparison: ">=",
    unit: "%",
    severity: "P1",
    window_minutes: 60,
    evaluate: async (admin) => {
      const since = new Date(Date.now() - 60 * 60_000).toISOString();
      const { count: total } = await admin
        .from("mission_instances")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since)
        .in("status", ["completed", "failed", "cancelled"]);
      if (!total || total === 0) return null;
      const { count: completed } = await admin
        .from("mission_instances")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since)
        .eq("status", "completed");
      return ((completed ?? 0) / total) * 100;
    },
  },
  {
    id: "missions.step_retry_rate",
    name: "Mission Step Retry Rate",
    description:
      "Percentage of core_jobs with attempts > 1 — should stay below 10%",
    component: "missions",
    target: 10,
    comparison: "<=",
    unit: "%",
    severity: "P2",
    window_minutes: 60,
    evaluate: async (admin) => {
      const since = new Date(Date.now() - 60 * 60_000).toISOString();
      const { count: total } = await admin
        .from("core_jobs")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since);
      if (!total || total === 0) return null;
      const { data: jobs } = await admin
        .from("core_jobs")
        .select("attempts")
        .gte("created_at", since)
        .gt("attempts", 1);
      const retried = jobs?.length ?? 0;
      return (retried / total) * 100;
    },
  },

  // ── Scraping ──────────────────────────────────────────────────────────────
  {
    id: "scraping.job_success_rate",
    name: "Scrape Job Success Rate",
    description:
      "Percentage of core_scrape_runs completed without error — last 24h",
    component: "scraping",
    target: 90,
    comparison: ">=",
    unit: "%",
    severity: "P1",
    window_minutes: 60 * 24,
    evaluate: async (admin) => {
      const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      // core_scrape_runs has no explicit status; proxy: notes IS NULL = success
      const { count: total } = await admin
        .from("core_scrape_runs")
        .select("*", { count: "exact", head: true })
        .gte("fetched_at", since);
      if (!total || total === 0) return null;
      // Rows with no error notes are treated as successful
      const { count: successful } = await admin
        .from("core_scrape_runs")
        .select("*", { count: "exact", head: true })
        .gte("fetched_at", since)
        .is("notes", null);
      return ((successful ?? 0) / total) * 100;
    },
  },

  // ── Economy ───────────────────────────────────────────────────────────────
  {
    id: "economy.negative_balances",
    name: "Negative Wallet Balances",
    description: "Count of wallets with balance < 0 — MUST be 0",
    component: "economy",
    target: 0,
    comparison: "<=",
    unit: "wallets",
    severity: "P0",
    window_minutes: 0, // point-in-time, not windowed
    evaluate: async (admin) => {
      const { count } = await admin
        .from("core_wallets")
        .select("*", { count: "exact", head: true })
        .lt("allowance_llm_balance", 0);
      return count ?? 0;
    },
  },
  {
    id: "economy.ledger_write_success",
    name: "Ledger Write Success Rate",
    description:
      "Percentage of core_ledger idempotency keys resolved — last 24h",
    component: "economy",
    target: 100,
    comparison: ">=",
    unit: "%",
    severity: "P0",
    window_minutes: 60 * 24,
    evaluate: async (admin) => {
      // proxy: jobs of type credit_debit — done vs total
      const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const { count: total } = await admin
        .from("core_jobs")
        .select("*", { count: "exact", head: true })
        .in("job_type", ["credit_debit", "credit_grant"])
        .gte("created_at", since);
      if (!total || total === 0) return null;
      const { count: done } = await admin
        .from("core_jobs")
        .select("*", { count: "exact", head: true })
        .in("job_type", ["credit_debit", "credit_grant"])
        .eq("status", "done")
        .gte("created_at", since);
      return ((done ?? 0) / total) * 100;
    },
  },
];

// ============================================================================
// EVALUATION RUNNER
// ============================================================================

/**
 * Evaluate all SLOs and return results sorted by severity then component.
 */
export async function evaluateAllSlos(
  admin: SupabaseClient,
): Promise<SloResult[]> {
  const results = await Promise.all(
    SLO_DEFINITIONS.map(async (slo) => {
      let measured: number | null = null;
      try {
        measured = await slo.evaluate(admin);
      } catch {
        // DB errors / missing tables → no_data
      }

      let status: SloStatus = "no_data";
      if (measured !== null) {
        const passes =
          slo.comparison === ">="
            ? measured >= slo.target
            : measured <= slo.target;
        status = passes ? "pass" : "breach";
      }

      return {
        slo_id: slo.id,
        name: slo.name,
        component: slo.component,
        status,
        measured,
        target: slo.target,
        unit: slo.unit,
        severity: slo.severity,
        window_minutes: slo.window_minutes,
        evaluated_at: new Date().toISOString(),
      } satisfies SloResult;
    }),
  );

  const SEVERITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return results.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.component.localeCompare(b.component),
  );
}

/**
 * Record SLO breaches into slo_breach_log.
 * Call this from the monitoring cron job.
 */
export async function persistSloBreaches(
  admin: SupabaseClient,
  results: SloResult[],
): Promise<void> {
  const breaches = results.filter((r) => r.status === "breach");
  if (breaches.length === 0) return;

  const rows = breaches.map((r) => {
    const slo = SLO_DEFINITIONS.find((s) => s.id === r.slo_id)!;
    return {
      slo_id: r.slo_id,
      component: r.component,
      measured_value: r.measured!,
      slo_target: slo.target,
      period_minutes: slo.window_minutes,
    };
  });

  await admin.from("slo_breach_log").insert(rows);
}
