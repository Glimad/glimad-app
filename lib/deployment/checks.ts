/**
 * lib/deployment/checks.ts
 * Brief 28: Migrations & Deployment Guide
 *
 * Individual deployment health checks. Each check is pure and async,
 * returning a CheckResult. Compose them into a full report via
 * runAllChecks() (see scripts/deploy-checklist.ts).
 */

import { publicEnv, serverEnv, validateEnvDetailed } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

import type { CheckResult, CheckStatus, DeploymentReport } from "./types";

/** Wrap an async check with timing + error handling. */
async function timed(
  id: string,
  name: string,
  fn: () => Promise<Omit<CheckResult, "id" | "name" | "duration_ms">>,
): Promise<CheckResult> {
  const start = Date.now();
  try {
    const result = await fn();
    return { id, name, ...result, duration_ms: Date.now() - start };
  } catch (err) {
    return {
      id,
      name,
      status: "fail",
      message: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Environment checks
// ---------------------------------------------------------------------------

export function checkEnvCore(): CheckResult {
  const start = Date.now();
  const result = validateEnvDetailed();
  const status: CheckStatus = result.valid ? "pass" : "fail";
  return {
    id: "env.core",
    name: "Core environment variables",
    status,
    message: result.valid
      ? "All critical env vars present"
      : `Missing: ${result.missing_core.join(", ")}`,
    details: {
      missing_core: result.missing_core,
      missing_payments: result.missing_payments,
      missing_email: result.missing_email,
      missing_cron: result.missing_cron,
    },
    duration_ms: Date.now() - start,
  };
}

export function checkEnvWarnings(): CheckResult {
  const start = Date.now();
  const result = validateEnvDetailed();
  const status: CheckStatus = result.warnings.length === 0 ? "pass" : "warn";
  return {
    id: "env.warnings",
    name: "Environment warnings",
    status,
    message:
      result.warnings.length === 0
        ? "No warnings"
        : `${result.warnings.length} warning(s)`,
    details: { warnings: result.warnings },
    duration_ms: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Database checks
// ---------------------------------------------------------------------------

/** Tables that MUST exist for the app to function. */
export const EXPECTED_TABLES = [
  "projects",
  "brain_facts",
  "brain_signals",
  "brain_snapshots",
  "mission_templates",
  "mission_instances",
  "core_outputs",
  "wallets",
  "ledger_transactions",
  "subscriptions",
  "stripe_products",
  "stripe_events",
  "credit_rules",
  "calendar_items",
  "content_assets",
  "visitor_sessions",
  "onboarding_sessions",
  "event_log",
  "user_preferences",
] as const;

/** Tables that MUST have RLS enabled. */
export const EXPECTED_RLS_TABLES = [
  "projects",
  "brain_facts",
  "brain_signals",
  "brain_snapshots",
  "mission_instances",
  "core_outputs",
  "wallets",
  "ledger_transactions",
  "subscriptions",
  "calendar_items",
  "content_assets",
  "user_preferences",
] as const;

export async function checkSupabaseReachable(): Promise<CheckResult> {
  return timed("db.reachable", "Supabase reachable", async () => {
    if (!publicEnv.SUPABASE_URL || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
      return {
        status: "skip",
        message: "Supabase URL or service role key not set",
      };
    }
    const admin = createAdminClient();
    const { error } = await admin
      .from("stripe_products")
      .select("id", { count: "exact", head: true })
      .limit(1);
    if (error) {
      return {
        status: "fail",
        message: `Supabase query failed: ${error.message}`,
      };
    }
    return { status: "pass", message: "Supabase reachable" };
  });
}

export async function checkTablesExist(): Promise<CheckResult> {
  return timed("db.tables", "Expected tables exist", async () => {
    if (!publicEnv.SUPABASE_URL || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
      return { status: "skip", message: "Supabase not configured" };
    }
    const admin = createAdminClient();
    const missing: string[] = [];
    for (const table of EXPECTED_TABLES) {
      const { error } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .limit(1);
      if (
        error &&
        /does not exist|Could not find the table/i.test(error.message)
      ) {
        missing.push(table);
      }
    }
    if (missing.length > 0) {
      return {
        status: "fail",
        message: `${missing.length} table(s) missing`,
        details: { missing },
      };
    }
    return {
      status: "pass",
      message: `All ${EXPECTED_TABLES.length} expected tables present`,
    };
  });
}

export async function checkSeedData(): Promise<CheckResult> {
  return timed("db.seed", "Seed data populated", async () => {
    if (!publicEnv.SUPABASE_URL || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
      return { status: "skip", message: "Supabase not configured" };
    }
    const admin = createAdminClient();
    const seedChecks: Array<{ table: string; min: number }> = [
      { table: "stripe_products", min: 1 },
      { table: "credit_rules", min: 1 },
      { table: "mission_templates", min: 1 },
    ];
    const results: Record<string, number> = {};
    const empty: string[] = [];
    for (const { table, min } of seedChecks) {
      const { count, error } = await admin
        .from(table)
        .select("*", { count: "exact", head: true });
      if (error) {
        return {
          status: "fail",
          message: `Failed to count ${table}: ${error.message}`,
        };
      }
      results[table] = count ?? 0;
      if ((count ?? 0) < min) empty.push(table);
    }
    if (empty.length > 0) {
      return {
        status: "fail",
        message: `Seed data missing for: ${empty.join(", ")}`,
        details: results,
      };
    }
    return {
      status: "pass",
      message: "All seed tables populated",
      details: results,
    };
  });
}

// ---------------------------------------------------------------------------
// External integrations
// ---------------------------------------------------------------------------

export async function checkAnthropic(): Promise<CheckResult> {
  return timed("anthropic.key", "Anthropic API key valid", async () => {
    if (!serverEnv.ANTHROPIC_API_KEY) {
      return { status: "fail", message: "ANTHROPIC_API_KEY not set" };
    }
    // Do not burn tokens on a live call during deploy check — only
    // verify the key format.
    const key = serverEnv.ANTHROPIC_API_KEY;
    if (!key.startsWith("sk-ant-")) {
      return {
        status: "warn",
        message:
          "ANTHROPIC_API_KEY does not match expected format (sk-ant-...)",
      };
    }
    return { status: "pass", message: "Key format valid (not live-tested)" };
  });
}

export async function checkStripe(): Promise<CheckResult> {
  return timed("stripe.key", "Stripe secret key valid", async () => {
    if (!serverEnv.STRIPE_SECRET_KEY) {
      return { status: "fail", message: "STRIPE_SECRET_KEY not set" };
    }
    const key = serverEnv.STRIPE_SECRET_KEY;
    if (!key.startsWith("sk_test_") && !key.startsWith("sk_live_")) {
      return {
        status: "warn",
        message: "STRIPE_SECRET_KEY does not match expected format",
      };
    }
    if (!serverEnv.STRIPE_WEBHOOK_SECRET) {
      return {
        status: "warn",
        message: "STRIPE_SECRET_KEY set but STRIPE_WEBHOOK_SECRET missing",
      };
    }
    const isTest = key.startsWith("sk_test_");
    return {
      status: "pass",
      message: `Key format valid (${isTest ? "test" : "live"} mode)`,
    };
  });
}

export async function checkResend(): Promise<CheckResult> {
  return timed("resend.key", "Resend API key present", async () => {
    if (!serverEnv.RESEND_API_KEY) {
      return { status: "warn", message: "RESEND_API_KEY not set" };
    }
    if (!serverEnv.RESEND_API_KEY.startsWith("re_")) {
      return {
        status: "warn",
        message: "RESEND_API_KEY does not match expected format (re_...)",
      };
    }
    return { status: "pass", message: "Key format valid" };
  });
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

/**
 * Run the full deployment check suite and return a structured report.
 * Checks run sequentially to avoid rate-limiting Supabase.
 */
export async function runAllChecks(): Promise<DeploymentReport> {
  const checks: CheckResult[] = [];

  // Env checks (synchronous)
  checks.push(checkEnvCore());
  checks.push(checkEnvWarnings());

  // DB checks
  checks.push(await checkSupabaseReachable());
  checks.push(await checkTablesExist());
  checks.push(await checkSeedData());

  // External integrations
  checks.push(await checkAnthropic());
  checks.push(await checkStripe());
  checks.push(await checkResend());

  const summary = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const c of checks) summary[c.status] += 1;

  const overall: CheckStatus =
    summary.fail > 0 ? "fail" : summary.warn > 0 ? "warn" : "pass";

  return {
    generated_at: new Date().toISOString(),
    overall,
    summary,
    checks,
  };
}
