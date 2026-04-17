/**
 * app/api/cron/slo-check/route.ts
 * Brief 31: Monitoring, SLOs & Incident Response
 *
 * Daily cron: evaluate all SLOs, fire alerts, open incidents for breaches.
 * Called by Vercel cron at 04:00 UTC daily.
 * Requires Authorization: Bearer $CRON_SECRET header (Vercel injects it).
 */

import { NextRequest, NextResponse } from "next/server";

import {
  evaluateAllSlos,
  persistSloBreaches,
  evaluateAlerts,
  openIncidentsForAlerts,
} from "@/lib/monitoring";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const secret = serverEnv.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();

    // 1. Evaluate all SLOs
    const sloResults = await evaluateAllSlos(admin);

    // 2. Persist breaches to slo_breach_log
    await persistSloBreaches(admin, sloResults);

    // 3. Derive firing alerts
    const firing = evaluateAlerts(sloResults);

    // 4. Open incidents for new P0/P1 alerts
    await openIncidentsForAlerts(admin, firing);

    const summary = {
      slos_evaluated: sloResults.length,
      slos_breached: sloResults.filter((r) => r.status === "breach").length,
      alerts_firing: firing.length,
      p0_firing: firing.filter((a) => a.severity === "P0").length,
      p1_firing: firing.filter((a) => a.severity === "P1").length,
    };

    console.log("[slo-check]", JSON.stringify(summary));

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[slo-check] cron error:", err);
    return NextResponse.json(
      { ok: false, error: "SLO check failed" },
      { status: 500 },
    );
  }
}
