/**
 * app/api/monitoring/incidents/route.ts
 * Brief 31: Monitoring, SLOs & Incident Response
 *
 * GET  /api/monitoring/incidents            — list open incidents
 * POST /api/monitoring/incidents            — create incident manually
 * PATCH /api/monitoring/incidents           — acknowledge or resolve
 *
 * All require CRON_SECRET.
 */

import { NextRequest } from "next/server";

import {
  ok,
  unauthorized,
  badRequest,
  internalError,
  notFound,
} from "@/lib/api";
import {
  createIncident,
  acknowledgeIncident,
  resolveIncident,
  getOpenIncidents,
  getRecentIncidents,
} from "@/lib/monitoring";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

function isAuthorized(req: NextRequest): boolean {
  const secret = serverEnv.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// ---------------------------------------------------------------------------
// GET — list open or recent incidents
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized("CRON_SECRET required");

  const params = new URL(req.url).searchParams;
  const mode = params.get("mode") ?? "open"; // "open" | "recent"
  const daysBack = Math.min(30, parseInt(params.get("days") ?? "7", 10) || 7);

  try {
    const admin = createAdminClient();
    const incidents =
      mode === "recent"
        ? await getRecentIncidents(admin, { daysBack })
        : await getOpenIncidents(admin);

    return ok({ count: incidents.length, incidents });
  } catch (e) {
    console.error("[api/monitoring/incidents] GET error:", e);
    return internalError("Failed to fetch incidents");
  }
}

// ---------------------------------------------------------------------------
// POST — create a manual incident
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized("CRON_SECRET required");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("title" in body) ||
    !("severity" in body) ||
    !("component" in body)
  ) {
    return badRequest("Required fields: title, severity (P0-P3), component");
  }

  const input = body as Record<string, unknown>;
  const severity = String(input.severity);
  if (!["P0", "P1", "P2", "P3"].includes(severity)) {
    return badRequest("severity must be one of P0, P1, P2, P3");
  }

  try {
    const admin = createAdminClient();
    const incident = await createIncident(admin, {
      title: String(input.title),
      severity: severity as "P0" | "P1" | "P2" | "P3",
      component: String(input.component),
      trigger_source: "manual",
      description: input.description ? String(input.description) : undefined,
      playbook_url: input.playbook_url ? String(input.playbook_url) : undefined,
      opened_by: input.opened_by ? String(input.opened_by) : "api",
    });

    if (!incident) return internalError("Failed to create incident");
    return ok({ incident });
  } catch (e) {
    console.error("[api/monitoring/incidents] POST error:", e);
    return internalError("Unexpected error creating incident");
  }
}

// ---------------------------------------------------------------------------
// PATCH — acknowledge or resolve an incident
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized("CRON_SECRET required");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("id" in body) ||
    !("action" in body)
  ) {
    return badRequest(
      "Required fields: id (UUID), action (acknowledge | resolve)",
    );
  }

  const input = body as Record<string, unknown>;
  const id = String(input.id);
  const action = String(input.action);

  if (!["acknowledge", "resolve"].includes(action)) {
    return badRequest("action must be acknowledge or resolve");
  }

  try {
    const admin = createAdminClient();

    if (action === "acknowledge") {
      const ok_ = await acknowledgeIncident(admin, id);
      if (!ok_) return notFound("Incident not found or already acknowledged");
      return ok({ acknowledged: true, incident_id: id });
    }

    // resolve
    const note = input.resolution_note
      ? String(input.resolution_note)
      : undefined;
    const ok_ = await resolveIncident(admin, id, note);
    if (!ok_) return notFound("Incident not found or already resolved");
    return ok({ resolved: true, incident_id: id });
  } catch (e) {
    console.error("[api/monitoring/incidents] PATCH error:", e);
    return internalError("Unexpected error updating incident");
  }
}
