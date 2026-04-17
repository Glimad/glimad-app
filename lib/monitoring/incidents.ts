/**
 * lib/monitoring/incidents.ts
 * Brief 31: Monitoring, SLOs & Incident Response
 *
 * CRUD helpers for the incident_log table.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// TYPES
// ============================================================================

export type IncidentStatus = "open" | "acknowledged" | "resolved" | "closed";
export type IncidentSeverity = "P0" | "P1" | "P2" | "P3";

export interface IncidentRow {
  id: string;
  title: string;
  severity: IncidentSeverity;
  component: string;
  status: IncidentStatus;
  trigger_source: string | null;
  alert_rule_id: string | null;
  description: string | null;
  playbook_url: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  opened_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateIncidentInput {
  title: string;
  severity: IncidentSeverity;
  component: string;
  trigger_source?: "alert" | "user_report" | "manual";
  alert_rule_id?: string;
  description?: string;
  playbook_url?: string;
  opened_by?: string;
}

export interface UpdateIncidentInput {
  status?: IncidentStatus;
  resolution_note?: string;
  description?: string;
}

// ============================================================================
// CRUD
// ============================================================================

/**
 * Open a new incident.
 */
export async function createIncident(
  admin: SupabaseClient,
  input: CreateIncidentInput,
): Promise<IncidentRow | null> {
  const { data, error } = await admin
    .from("incident_log")
    .insert({
      title: input.title,
      severity: input.severity,
      component: input.component,
      status: "open",
      trigger_source: input.trigger_source ?? "manual",
      alert_rule_id: input.alert_rule_id ?? null,
      description: input.description ?? null,
      playbook_url: input.playbook_url ?? null,
      opened_by: input.opened_by ?? "unknown",
    })
    .select()
    .single();

  if (error) {
    console.error("[incidents] createIncident failed:", error.message);
    return null;
  }
  return data as IncidentRow;
}

/**
 * Acknowledge an open incident.
 */
export async function acknowledgeIncident(
  admin: SupabaseClient,
  incidentId: string,
): Promise<boolean> {
  const { error } = await admin
    .from("incident_log")
    .update({
      status: "acknowledged",
      acknowledged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", incidentId)
    .eq("status", "open");

  if (error) {
    console.error("[incidents] acknowledgeIncident failed:", error.message);
    return false;
  }
  return true;
}

/**
 * Resolve an incident with an optional resolution note.
 */
export async function resolveIncident(
  admin: SupabaseClient,
  incidentId: string,
  resolutionNote?: string,
): Promise<boolean> {
  const { error } = await admin
    .from("incident_log")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolution_note: resolutionNote ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", incidentId)
    .in("status", ["open", "acknowledged"]);

  if (error) {
    console.error("[incidents] resolveIncident failed:", error.message);
    return false;
  }
  return true;
}

/**
 * List open + acknowledged incidents, newest first.
 */
export async function getOpenIncidents(
  admin: SupabaseClient,
  limit = 50,
): Promise<IncidentRow[]> {
  const { data, error } = await admin
    .from("incident_log")
    .select("*")
    .in("status", ["open", "acknowledged"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[incidents] getOpenIncidents failed:", error.message);
    return [];
  }
  return (data ?? []) as IncidentRow[];
}

/**
 * List recent incidents for a specific severity or component.
 */
export async function getRecentIncidents(
  admin: SupabaseClient,
  options: {
    severity?: IncidentSeverity;
    component?: string;
    daysBack?: number;
    limit?: number;
  } = {},
): Promise<IncidentRow[]> {
  const { severity, component, daysBack = 7, limit = 100 } = options;
  const since = new Date(Date.now() - daysBack * 86_400_000).toISOString();

  let q = admin
    .from("incident_log")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (severity) q = q.eq("severity", severity);
  if (component) q = q.eq("component", component);

  const { data, error } = await q;
  if (error) {
    console.error("[incidents] getRecentIncidents failed:", error.message);
    return [];
  }
  return (data ?? []) as IncidentRow[];
}

/**
 * Count P0/P1 incidents in the last N days — for executive dashboard.
 */
export async function countCriticalIncidents(
  admin: SupabaseClient,
  daysBack = 7,
): Promise<{ P0: number; P1: number }> {
  const since = new Date(Date.now() - daysBack * 86_400_000).toISOString();

  const [{ count: p0 }, { count: p1 }] = await Promise.all([
    admin
      .from("incident_log")
      .select("*", { count: "exact", head: true })
      .eq("severity", "P0")
      .gte("created_at", since),
    admin
      .from("incident_log")
      .select("*", { count: "exact", head: true })
      .eq("severity", "P1")
      .gte("created_at", since),
  ]);

  return { P0: p0 ?? 0, P1: p1 ?? 0 };
}
