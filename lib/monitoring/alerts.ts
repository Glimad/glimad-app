/**
 * lib/monitoring/alerts.ts
 * Brief 31: Monitoring, SLOs & Incident Response
 *
 * Alert rule registry and evaluation.
 * Each rule evaluates against live SLO results and/or DB state.
 * Firing an alert creates (or updates) an incident_log row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { SLO_DEFINITIONS } from "./slos";
import type { SloResult } from "./slos";

// ============================================================================
// TYPES
// ============================================================================

export type AlertSeverity = "P0" | "P1" | "P2" | "P3";

export interface AlertRule {
  id: string;
  name: string;
  component: string;
  severity: AlertSeverity;
  /** SLO IDs that trigger this alert when breached */
  slo_ids?: string[];
  /** Human-readable description of the condition */
  condition: string;
  /** Link to the incident playbook */
  playbook_url: string;
  /** Recommended first action */
  immediate_action: string;
}

export interface AlertFiring {
  rule_id: string;
  rule_name: string;
  severity: AlertSeverity;
  component: string;
  message: string;
  playbook_url: string;
  immediate_action: string;
  /** SLO values that triggered the alert */
  slo_context: Array<{
    slo_id: string;
    measured: number | null;
    target: number;
    unit: string;
  }>;
  fired_at: string;
}

// ============================================================================
// ALERT RULES (from spec § 4)
// ============================================================================

export const ALERT_RULES: AlertRule[] = [
  // ── P0 Critical ───────────────────────────────────────────────────────────
  {
    id: "alert.payments.webhook_down",
    name: "Payment Processing Down",
    component: "payments",
    severity: "P0",
    slo_ids: ["payments.webhook_success_rate"],
    condition: "Stripe webhook success rate <99.9% in last 10 minutes",
    playbook_url: "https://glimad.notion.so/playbook-stripe-webhooks",
    immediate_action:
      "Check Stripe Dashboard → Developers → Webhooks. Manually replay failed events. Verify STRIPE_WEBHOOK_SECRET matches.",
  },
  {
    id: "alert.economy.negative_balance",
    name: "Negative Wallet Balance Detected",
    component: "economy",
    severity: "P0",
    slo_ids: ["economy.negative_balances"],
    condition: "Any wallet has balance < 0",
    playbook_url: "https://glimad.notion.so/playbook-negative-balance",
    immediate_action:
      "Block affected user from new operations immediately. Query core_ledger for the user to find the race condition. Fix ledger and refund if applicable.",
  },
  {
    id: "alert.economy.ledger_writes_failing",
    name: "Ledger Writes Failing",
    component: "economy",
    severity: "P0",
    slo_ids: ["economy.ledger_write_success"],
    condition: "Ledger write success rate drops below 100%",
    playbook_url: "https://glimad.notion.so/playbook-ledger-writes",
    immediate_action:
      "Check Supabase logs for constraint violations. Investigate idempotency key collisions. Do NOT retry without idempotency check.",
  },

  // ── P1 High ───────────────────────────────────────────────────────────────
  {
    id: "alert.missions.success_rate_drop",
    name: "Mission Success Rate Drop",
    component: "missions",
    severity: "P1",
    slo_ids: ["missions.completion_rate"],
    condition: "Mission completion rate <95% in last hour",
    playbook_url: "https://glimad.notion.so/playbook-mission-failures",
    immediate_action:
      "Check Anthropic status page. Review recent mission_instances failures. Check if LLM fallback is active.",
  },
  {
    id: "alert.scraping.blocked",
    name: "Scraping Blocked by Anti-Bot",
    component: "scraping",
    severity: "P1",
    slo_ids: ["scraping.job_success_rate"],
    condition: "Scrape job success rate <90% in last 24h",
    playbook_url: "https://glimad.notion.so/playbook-scraping-blocked",
    immediate_action:
      "Check core_scrape_runs.notes for error codes. Test manually. Rotate user-agent. Do not increase retry rate while blocked.",
  },
  {
    id: "alert.brain.snapshot_failures",
    name: "Brain Snapshot Failures",
    component: "brain",
    severity: "P1",
    slo_ids: ["brain.signal_write_success"],
    condition: "Brain snapshot job success rate <99.9% in last hour",
    playbook_url: "https://glimad.notion.so/playbook-brain-failures",
    immediate_action:
      "Check core_jobs for brain_snapshot failures. Verify brain_facts and brain_signals constraints. Re-trigger failed snapshots manually.",
  },

  // ── P2 Medium ─────────────────────────────────────────────────────────────
  {
    id: "alert.missions.high_retry_rate",
    name: "Mission Step Retry Rate High",
    component: "missions",
    severity: "P2",
    slo_ids: ["missions.step_retry_rate"],
    condition: "Mission step retry rate >10% in last hour",
    playbook_url: "https://glimad.notion.so/playbook-high-retry-rate",
    immediate_action:
      "Check LLM provider status. Review flaky external service calls. Consider increasing timeouts.",
  },
];

// ============================================================================
// EVALUATION
// ============================================================================

/**
 * Evaluate alert rules against current SLO results.
 * Returns rules that are currently firing.
 */
export function evaluateAlerts(sloResults: SloResult[]): AlertFiring[] {
  const sloMap = new Map(sloResults.map((r) => [r.slo_id, r]));
  const firing: AlertFiring[] = [];

  for (const rule of ALERT_RULES) {
    if (!rule.slo_ids || rule.slo_ids.length === 0) continue;

    const breachedSlos = rule.slo_ids
      .map((id) => sloMap.get(id))
      .filter((r): r is SloResult => r !== undefined && r.status === "breach");

    if (breachedSlos.length === 0) continue;

    const slo_context = breachedSlos.map((r) => ({
      slo_id: r.slo_id,
      measured: r.measured,
      target: r.target,
      unit: r.unit,
    }));

    const summaryLines = breachedSlos.map((r) => {
      const def = SLO_DEFINITIONS.find((s) => s.id === r.slo_id);
      const cmp = def?.comparison === ">=" ? "≥" : "≤";
      const val = r.measured !== null ? r.measured.toFixed(2) : "no data";
      return `${r.name}: ${val}${r.unit} (target ${cmp}${r.target}${r.unit})`;
    });

    firing.push({
      rule_id: rule.id,
      rule_name: rule.name,
      severity: rule.severity,
      component: rule.component,
      message: `[${rule.severity}] ${rule.name} — ${summaryLines.join("; ")}`,
      playbook_url: rule.playbook_url,
      immediate_action: rule.immediate_action,
      slo_context,
      fired_at: new Date().toISOString(),
    });
  }

  // Sort: P0 first
  const ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return firing.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

// ============================================================================
// INCIDENT CREATION FROM ALERTS
// ============================================================================

/**
 * For each firing alert, open an incident_log row if one isn't already
 * open for that alert_rule_id within the last 60 minutes.
 * Prevents incident spam for sustained outages.
 */
export async function openIncidentsForAlerts(
  admin: SupabaseClient,
  firing: AlertFiring[],
): Promise<void> {
  if (firing.length === 0) return;

  const since = new Date(Date.now() - 60 * 60_000).toISOString();

  for (const alert of firing) {
    // Check if an open incident already exists for this alert
    const { count } = await admin
      .from("incident_log")
      .select("*", { count: "exact", head: true })
      .eq("alert_rule_id", alert.rule_id)
      .in("status", ["open", "acknowledged"])
      .gte("created_at", since);

    if ((count ?? 0) > 0) continue; // already open

    await admin.from("incident_log").insert({
      title: alert.rule_name,
      severity: alert.severity,
      component: alert.component,
      status: "open",
      trigger_source: "alert",
      alert_rule_id: alert.rule_id,
      description: alert.message,
      playbook_url: alert.playbook_url,
      opened_by: "system",
    });
  }
}

// ============================================================================
// ON-CALL RESPONSE TIMES (from spec § 7)
// ============================================================================

export const RESPONSE_TIME_SLA: Record<
  AlertSeverity,
  { ack_minutes: number; resolution_minutes: number }
> = {
  P0: { ack_minutes: 15, resolution_minutes: 60 },
  P1: { ack_minutes: 30, resolution_minutes: 240 },
  P2: { ack_minutes: 120, resolution_minutes: 1440 },
  P3: { ack_minutes: 1440, resolution_minutes: 99999 },
};
