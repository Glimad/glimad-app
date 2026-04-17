/**
 * app/api/monitoring/alerts/route.ts
 * Brief 31: Monitoring, SLOs & Incident Response
 *
 * GET /api/monitoring/alerts
 *   Evaluates SLOs, derives currently-firing alerts, optionally opens incidents.
 *   Requires CRON_SECRET (ops/admin only).
 *
 * Query params:
 *   ?open_incidents=true  — open incident_log rows for new P0/P1 firing alerts
 *
 * POST /api/monitoring/alerts/incidents/:id/acknowledge  — via incidents route
 */

import { NextRequest } from "next/server";

import { ok, unauthorized, internalError } from "@/lib/api";
import {
  evaluateAllSlos,
  evaluateAlerts,
  openIncidentsForAlerts,
  getOpenIncidents,
  ALERT_RULES,
  RESPONSE_TIME_SLA,
} from "@/lib/monitoring";
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

  const params = new URL(req.url).searchParams;
  const openIncidents = params.get("open_incidents") === "true";

  try {
    const admin = createAdminClient();

    // Evaluate SLOs then derive firing alerts in parallel with open incidents
    const sloResults = await evaluateAllSlos(admin);
    const firing = evaluateAlerts(sloResults);

    const [openIncidentsList] = await Promise.all([
      getOpenIncidents(admin, 20),
      openIncidents ? openIncidentsForAlerts(admin, firing) : Promise.resolve(),
    ]);

    return ok({
      firing_count: firing.length,
      firing,
      open_incidents: openIncidentsList,
      registered_rules: ALERT_RULES.map((r) => ({
        id: r.id,
        name: r.name,
        component: r.component,
        severity: r.severity,
        condition: r.condition,
      })),
      response_time_sla: RESPONSE_TIME_SLA,
    });
  } catch (e) {
    console.error("[api/monitoring/alerts] error:", e);
    return internalError("Failed to evaluate alerts");
  }
}
