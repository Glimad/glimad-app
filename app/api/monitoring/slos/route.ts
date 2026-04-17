/**
 * app/api/monitoring/slos/route.ts
 * Brief 31: Monitoring, SLOs & Incident Response
 *
 * GET /api/monitoring/slos
 *   Evaluates all SLOs against the live DB and returns results.
 *   Requires CRON_SECRET (ops/admin only).
 *
 * Query params:
 *   ?persist=true  — also writes breaches to slo_breach_log
 */

import { NextRequest } from "next/server";

import { ok, unauthorized, internalError } from "@/lib/api";
import { evaluateAllSlos, persistSloBreaches } from "@/lib/monitoring";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

function isAuthorized(req: NextRequest): boolean {
  const secret = serverEnv.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorized("CRON_SECRET required");
  }

  const persist = new URL(req.url).searchParams.get("persist") === "true";

  try {
    const admin = createAdminClient();
    const results = await evaluateAllSlos(admin);

    if (persist) {
      await persistSloBreaches(admin, results);
    }

    const summary = {
      total: results.length,
      pass: results.filter((r) => r.status === "pass").length,
      breach: results.filter((r) => r.status === "breach").length,
      no_data: results.filter((r) => r.status === "no_data").length,
    };

    return ok({ summary, slos: results });
  } catch (e) {
    console.error("[api/monitoring/slos] error:", e);
    return internalError("Failed to evaluate SLOs");
  }
}
