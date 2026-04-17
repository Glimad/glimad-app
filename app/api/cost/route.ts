/**
 * app/api/cost/route.ts
 * Brief 29: Developer Cost Tracking & Validation
 *
 * GET  /api/cost              — cost summary (requires CRON_SECRET)
 * POST /api/cost              — record a single cost entry (requires CRON_SECRET)
 *
 * These routes are developer/ops only. Frontend users never call them.
 * Use them from:
 *   - n8n workflows to log operation costs after each job
 *   - Internal admin dashboards
 *   - scripts/deploy-checklist.ts (optional)
 */

import { NextRequest } from "next/server";

import { ok, unauthorized, badRequest, internalError } from "@/lib/api";
import { logCost, getCostSummary } from "@/lib/cost";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Auth guard (CRON_SECRET — same mechanism as /api/health)
// ---------------------------------------------------------------------------

function isAuthorized(req: NextRequest): boolean {
  const secret = serverEnv.CRON_SECRET;
  // Reject immediately if CRON_SECRET is not configured — prevents accidental open access.
  if (!secret) return false;
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

// ---------------------------------------------------------------------------
// GET /api/cost — return cost summary report
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorized("CRON_SECRET required");
  }

  const { searchParams } = new URL(req.url);
  const days = Math.min(
    90,
    Math.max(1, parseInt(searchParams.get("days") ?? "30", 10) || 30),
  );

  try {
    const admin = createAdminClient();
    const summary = await getCostSummary(admin, days);
    return ok({ summary });
  } catch (e) {
    console.error("[api/cost] GET error:", e);
    return internalError("Failed to generate cost summary");
  }
}

// ---------------------------------------------------------------------------
// POST /api/cost — record a single cost entry (from n8n or other services)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorized("CRON_SECRET required");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("operation_type" in body) ||
    !("cost_eur" in body)
  ) {
    return badRequest("Missing required fields: operation_type, cost_eur");
  }

  const input = body as Record<string, unknown>;

  const operationType = String(input.operation_type);
  const costEur = Number(input.cost_eur);

  if (!operationType || isNaN(costEur) || costEur < 0) {
    return badRequest(
      "operation_type must be a non-empty string; cost_eur must be a non-negative number",
    );
  }

  try {
    const success = await logCost({
      operation_type: operationType,
      cost_eur: costEur,
      project_id: input.project_id ? String(input.project_id) : null,
      user_id: input.user_id ? String(input.user_id) : null,
      plan_code: input.plan_code ? String(input.plan_code) : null,
      credits_consumed:
        input.credits_consumed != null ? Number(input.credits_consumed) : null,
      cost_per_credit_eur:
        input.cost_per_credit_eur != null
          ? Number(input.cost_per_credit_eur)
          : null,
      duration_ms: input.duration_ms != null ? Number(input.duration_ms) : null,
      tokens_input:
        input.tokens_input != null ? Number(input.tokens_input) : null,
      tokens_output:
        input.tokens_output != null ? Number(input.tokens_output) : null,
      retry_count: input.retry_count != null ? Number(input.retry_count) : 0,
      provider: input.provider ? String(input.provider) : null,
      model: input.model ? String(input.model) : null,
      correlation_id: input.correlation_id
        ? String(input.correlation_id)
        : null,
      job_id: input.job_id ? String(input.job_id) : null,
      success: input.success !== false,
      error_message: input.error_message ? String(input.error_message) : null,
    });

    if (!success) {
      return internalError("Failed to persist cost log");
    }

    return ok({
      logged: true,
      operation_type: operationType,
      cost_eur: costEur,
    });
  } catch (e) {
    console.error("[api/cost] POST error:", e);
    return internalError("Unexpected error logging cost");
  }
}
