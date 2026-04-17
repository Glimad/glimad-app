/**
 * lib/security/rls-policies.ts
 * Brief 24: RLS Policy Reference + Validation Helpers
 *
 * Documents all RLS policies and provides runtime checks.
 * The actual SQL lives in supabase/migrations/028_rls_policies_complete.sql
 */

import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// ============================================================================
// POLICY REGISTRY (documentation + validation)
// ============================================================================

export type PolicyPattern =
  | "owner"
  | "project"
  | "service_only"
  | "public"
  | "admin_only";

export interface RLSPolicy {
  table: string;
  operations: Array<"SELECT" | "INSERT" | "UPDATE" | "DELETE">;
  pattern: PolicyPattern;
  description: string;
}

/**
 * Authoritative list of all RLS policies in the system.
 * Used for documentation, auditing, and testing.
 */
export const RLS_POLICIES: RLSPolicy[] = [
  // ---- Owner-based (user_id = auth.uid()) ----
  {
    table: "projects",
    operations: ["SELECT", "INSERT", "UPDATE"],
    pattern: "owner",
    description: "Users own their projects",
  },
  {
    table: "core_subscriptions",
    operations: ["SELECT"],
    pattern: "owner",
    description: "Users see own subscriptions",
  },
  {
    table: "core_access_grants",
    operations: ["SELECT"],
    pattern: "owner",
    description: "Users see own access grants",
  },
  {
    table: "gdpr_consents",
    operations: ["SELECT", "INSERT", "UPDATE"],
    pattern: "owner",
    description: "Users manage own GDPR consents",
  },
  {
    table: "gdpr_data_requests",
    operations: ["SELECT", "INSERT"],
    pattern: "owner",
    description: "Users manage own data requests",
  },
  {
    table: "gdpr_data_sharing_log",
    operations: ["SELECT"],
    pattern: "owner",
    description: "Users see own data sharing log",
  },
  {
    table: "gdpr_processing_log",
    operations: ["SELECT"],
    pattern: "owner",
    description: "Users see own processing log",
  },
  {
    table: "onboarding_sessions",
    operations: ["SELECT"],
    pattern: "owner",
    description: "Users see own onboarding sessions",
  },

  // ---- Project-based (EXISTS projects WHERE user_id = auth.uid()) ----
  {
    table: "user_preferences",
    operations: ["SELECT", "INSERT", "UPDATE"],
    pattern: "project",
    description: "Users manage own preferences",
  },
  {
    table: "brain_facts",
    operations: ["SELECT", "INSERT", "UPDATE"],
    pattern: "project",
    description: "Users access own brain facts",
  },
  {
    table: "brain_facts_history",
    operations: ["SELECT"],
    pattern: "project",
    description: "Users see own brain facts history",
  },
  {
    table: "brain_signals",
    operations: ["SELECT", "INSERT"],
    pattern: "project",
    description: "Users access own brain signals",
  },
  {
    table: "brain_snapshots",
    operations: ["SELECT", "INSERT"],
    pattern: "project",
    description: "Users access own brain snapshots",
  },
  {
    table: "core_wallets",
    operations: ["SELECT", "INSERT"],
    pattern: "project",
    description: "Users access own wallet",
  },
  {
    table: "core_ledger",
    operations: ["SELECT", "INSERT"],
    pattern: "project",
    description: "Users see own ledger",
  },
  {
    table: "core_outputs",
    operations: ["SELECT", "INSERT", "UPDATE"],
    pattern: "project",
    description: "Users access own outputs",
  },
  {
    table: "core_calendar_items",
    operations: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    pattern: "project",
    description: "Users manage own calendar",
  },
  {
    table: "core_assets",
    operations: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    pattern: "project",
    description: "Users manage own content assets",
  },
  {
    table: "core_scrape_runs",
    operations: ["SELECT", "INSERT"],
    pattern: "project",
    description: "Users see own scrape runs",
  },
  {
    table: "mission_instances",
    operations: ["SELECT", "INSERT", "UPDATE"],
    pattern: "project",
    description: "Users access own mission instances",
  },
  {
    table: "mission_steps",
    operations: ["SELECT", "INSERT"],
    pattern: "project",
    description: "Users see own mission steps",
  },
  {
    table: "pulse_runs",
    operations: ["SELECT"],
    pattern: "project",
    description: "Users see own pulse runs",
  },
  {
    table: "notifications",
    operations: ["SELECT", "INSERT", "UPDATE"],
    pattern: "project",
    description: "Users manage own notifications",
  },
  {
    table: "monetization_products",
    operations: ["SELECT", "INSERT", "UPDATE"],
    pattern: "project",
    description: "Users manage own products",
  },
  {
    table: "monetization_events",
    operations: ["SELECT", "INSERT"],
    pattern: "project",
    description: "Users manage own events",
  },
  {
    table: "service_requests_backlog",
    operations: ["SELECT", "INSERT", "UPDATE"],
    pattern: "project",
    description: "Users manage own service requests",
  },
  {
    table: "core_experiments",
    operations: ["SELECT", "INSERT", "UPDATE"],
    pattern: "project",
    description: "Users manage own experiments",
  },
  {
    table: "core_experiment_variants",
    operations: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    pattern: "project",
    description: "Users manage own experiment variants",
  },
  {
    table: "core_experiment_items",
    operations: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    pattern: "project",
    description: "Users manage own experiment items",
  },
  {
    table: "core_learnings",
    operations: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    pattern: "project",
    description: "Users manage own learnings",
  },
  {
    table: "core_performance_winners",
    operations: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    pattern: "project",
    description: "Users manage own performance winners",
  },
  {
    table: "core_cost_metrics",
    operations: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    pattern: "project",
    description: "Users manage own cost metrics",
  },
  {
    table: "core_lab_jobs",
    operations: ["SELECT", "INSERT"],
    pattern: "project",
    description: "Users can view and create jobs",
  },
  {
    table: "core_brain_updates",
    operations: ["SELECT"],
    pattern: "project",
    description: "Users can view own brain updates",
  },
  {
    table: "analytics_events",
    operations: ["SELECT", "INSERT"],
    pattern: "project",
    description: "Users see and create analytics events",
  },

  // ---- Service-only (no user policies → service role bypass) ----
  {
    table: "core_lab_jobs",
    operations: ["UPDATE", "DELETE"],
    pattern: "service_only",
    description: "Job runner updates job status",
  },
  {
    table: "core_brain_updates",
    operations: ["INSERT", "UPDATE"],
    pattern: "service_only",
    description: "Only runner writes brain updates",
  },
  {
    table: "core_payments",
    operations: ["SELECT", "INSERT", "UPDATE"],
    pattern: "service_only",
    description: "Payment processing is server-side",
  },

  // ---- Brand Backstage (read-only for authenticated brands) ----
  {
    table: "core_brand_profiles",
    operations: ["SELECT"],
    pattern: "public",
    description: "Authenticated users can view brand profiles",
  },
  {
    table: "core_brand_scores",
    operations: ["SELECT"],
    pattern: "public",
    description: "Authenticated users can view brand scores",
  },
  {
    table: "core_brand_api_keys",
    operations: ["SELECT"],
    pattern: "service_only",
    description: "API keys are service-role only",
  },

  // ---- Event log (read limited) ----
  {
    table: "event_log",
    operations: ["SELECT", "INSERT"],
    pattern: "project",
    description: "Users see own event log",
  },
  {
    table: "event_definitions",
    operations: ["SELECT"],
    pattern: "public",
    description: "All authenticated can read event definitions",
  },
  {
    table: "event_tracking_config",
    operations: ["SELECT", "INSERT", "UPDATE"],
    pattern: "project",
    description: "Users manage own tracking config",
  },

  // ---- Admin-only ----
  {
    table: "core_security_events",
    operations: ["SELECT", "INSERT"],
    pattern: "admin_only",
    description: "Security events admin only",
  },

  // ---- Public (no RLS needed) ----
  {
    table: "mission_templates",
    operations: ["SELECT"],
    pattern: "public",
    description: "Template catalog is public read",
  },
  {
    table: "core_plans",
    operations: ["SELECT"],
    pattern: "public",
    description: "Plans are public read",
  },
];

// ============================================================================
// AUDIT HELPERS
// ============================================================================

/**
 * Get all policies for a specific table.
 */
export function getPoliciesForTable(tableName: string): RLSPolicy[] {
  return RLS_POLICIES.filter((p) => p.table === tableName);
}

/**
 * Get all tables that should have RLS enabled.
 */
export function getTablesRequiringRLS(): string[] {
  const seen = new Set<string>();
  return RLS_POLICIES.filter((p) => p.pattern !== "public")
    .map((p) => p.table)
    .filter((t) => {
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });
}

/**
 * Check if a table has policies defined for all critical operations.
 * Returns missing operations.
 */
export function checkPolicyCoverage(
  tableName: string,
  requiredOps: Array<"SELECT" | "INSERT" | "UPDATE" | "DELETE"> = [
    "SELECT",
    "INSERT",
  ],
): { covered: boolean; missing: string[] } {
  const policies = getPoliciesForTable(tableName);
  const coveredSet = policies.flatMap((p) => p.operations);
  const missing = requiredOps.filter((op) => !coveredSet.includes(op));
  return { covered: missing.length === 0, missing };
}

// ============================================================================
// RUNTIME VALIDATION
// ============================================================================

/**
 * Verify a user can access a project (used in API routes before admin queries).
 * Returns the project ID if accessible, null otherwise.
 */
export async function verifyProjectAccess(
  admin: AdminClient,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .neq("status", "archived")
    .single();
  return !!data;
}

/**
 * Get the project ID for the authenticated user.
 * Returns null if no active project.
 */
export async function getUserProjectId(
  admin: AdminClient,
  userId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .neq("status", "archived")
    .single();
  return data?.id ?? null;
}

/**
 * Verify row-level ownership before a sensitive mutation.
 * Use this in API routes as a secondary check when service role is used.
 */
export async function verifyRowOwnership(
  admin: AdminClient,
  table:
    | "core_assets"
    | "core_experiments"
    | "core_learnings"
    | "mission_instances",
  rowId: string,
  userId: string,
): Promise<boolean> {
  const idColumn: Record<string, string> = {
    core_assets: "id",
    core_experiments: "experiment_id",
    core_learnings: "learning_id",
    mission_instances: "id",
  };

  const { data } = await admin
    .from(table)
    .select("project_id")
    .eq(idColumn[table], rowId)
    .single();

  if (!data) return false;

  return verifyProjectAccess(admin, userId, data.project_id as string);
}

// ============================================================================
// COMMON RLS PITFALL GUARDS
// ============================================================================

/**
 * Detect if an error is an RLS violation (PGRST301 or permission denied).
 */
export function isRLSViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  return (
    err.code === "PGRST301" ||
    err.message?.includes("permission denied") === true ||
    err.message?.includes("new row violates row-level security") === true
  );
}

/**
 * Safe assertion: throw a 403 if user doesn't own the resource.
 */
export function assertOwnership(owned: boolean, resource = "resource"): void {
  if (!owned) {
    throw new Error(`Access denied: You do not own this ${resource}`);
  }
}
