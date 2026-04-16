/**
 * app/api/cron/brand-score-aggregation/route.ts
 * Scheduled job: Daily brand score aggregation at 03:00 UTC
 * Triggers: Calculate scores for all opted-in creators
 *
 * Deployment: Vercel Cron - @daily03:00 UTC
 * Security: Vercel Deploy Webhook Token verification
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BrandAPI } from "@/lib/brand-api";

/**
 * Verify Vercel cron signature
 */
function verifyCronSignature(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return false;
  }

  const token = authHeader.replace("Bearer ", "");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken) {
    console.warn("CRON_SECRET not configured");
    return false;
  }

  return token === expectedToken;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Verify cron trigger
  if (!verifyCronSignature(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized cron job" },
      { status: 401 },
    );
  }

  const admin = createAdminClient();

  try {
    console.log("[CRON] Starting daily brand score aggregation...");

    // Run aggregation
    await BrandAPI.aggregateAllBrandScores(admin);

    const executionTimeMs = Date.now() - startTime;

    console.log(
      `[CRON] Brand score aggregation completed in ${executionTimeMs}ms`,
    );

    return NextResponse.json(
      {
        ok: true,
        message: "Brand score aggregation completed",
        executionTimeMs,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[CRON] Brand score aggregation failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTimeMs: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}

/**
 * Manual trigger for testing (Vercel CI/CD only)
 * POST /api/cron/brand-score-aggregation?test=true
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const isTest = url.searchParams.get("test") === "true";

  // Only allow in non-production environments for testing
  if (isTest && process.env.NODE_ENV !== "production") {
    const admin = createAdminClient();
    const startTime = Date.now();

    try {
      console.log("[TEST] Starting test brand score aggregation...");
      await BrandAPI.aggregateAllBrandScores(admin);

      return NextResponse.json(
        {
          ok: true,
          message: "Test aggregation completed",
          executionTimeMs: Date.now() - startTime,
        },
        { status: 200 },
      );
    } catch (error) {
      console.error("[TEST] Test aggregation failed:", error);
      return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
}
