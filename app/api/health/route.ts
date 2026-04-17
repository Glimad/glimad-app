/**
 * app/api/health/route.ts
 * Brief 25: Configuration health check endpoint
 *
 * GET /api/health
 *   - Public: returns basic uptime status
 *
 * GET /api/health?detailed=true  (requires CRON_SECRET in Authorization)
 *   - Admin: returns detailed env validation + feature flags
 */

import { NextRequest, NextResponse } from "next/server";
import { validateEnvDetailed, features, serverEnv } from "@/lib/env";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const detailed = searchParams.get("detailed") === "true";

  // Detailed check requires CRON_SECRET auth (admin-only)
  if (detailed) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${serverEnv.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const envResult = validateEnvDetailed();

    return NextResponse.json({
      status: envResult.valid ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? "unknown",
      env_validation: {
        valid: envResult.valid,
        missing_core: envResult.missing_core,
        missing_payments: envResult.missing_payments,
        missing_email: envResult.missing_email,
        missing_cron: envResult.missing_cron,
        warnings: envResult.warnings,
      },
      features: {
        payments: features.payments,
        email: features.email,
        n8n: features.n8n,
        scrape_youtube: features.scrape_youtube,
        scrape_twitter: features.scrape_twitter,
        scrape_spotify: features.scrape_spotify,
        scrape_apify: features.scrape_apify,
      },
    });
  }

  // Public basic health check
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
