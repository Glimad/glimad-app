/**
 * app/api/brand/scores/route.ts
 * GET /api/brand/scores - Get time-series scores
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BrandAPIHandlers } from "@/lib/brand-api-handlers";

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const admin = createAdminClient();

  try {
    // Get API key from header
    const apiKey = request.headers.get("X-Brand-API-Key");
    const requestIp = request.headers.get("x-forwarded-for") || "unknown";

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing X-Brand-API-Key header",
          code: "GLM_BRAND_API_INVALID_KEY",
        },
        { status: 401 },
      );
    }

    // Validate API key
    const keyValidation = await BrandAPIHandlers.getAndValidateAPIKey(
      admin,
      apiKey,
    );
    if (!keyValidation.ok || !keyValidation.key) {
      return NextResponse.json(
        {
          ok: false,
          error: keyValidation.error,
          code: "GLM_BRAND_API_INVALID_KEY",
        },
        { status: 401 },
      );
    }

    // Check rate limits
    const rateCheckResult = await BrandAPIHandlers.checkRateLimit(
      admin,
      keyValidation.key.id,
      keyValidation.key.tier,
    );
    if (!rateCheckResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: rateCheckResult.message,
          code: "GLM_BRAND_API_RATE_LIMIT",
        },
        { status: 429 },
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const profileIds = url.searchParams.getAll("profileId");
    const periodDays = parseInt(url.searchParams.get("periodDays") || "30");

    if (!profileIds || profileIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing profileId query parameter",
          code: "GLM_INVALID_REQUEST",
        },
        { status: 400 },
      );
    }

    // Call handler
    const result = await BrandAPIHandlers.handleGetScores(
      admin,
      profileIds,
      periodDays,
    );

    // Log usage
    const responseTimeMs = Date.now() - startTime;
    await BrandAPIHandlers.logAPIUsage(
      admin,
      keyValidation.key.id,
      keyValidation.key.tier,
      "/api/brand/scores",
      "GET",
      result.ok ? 200 : 400,
      responseTimeMs,
      requestIp,
    );

    return NextResponse.json(
      {
        ...result,
        metadata: {
          requestId: request.headers.get("x-request-id") || "unknown",
          rateLimit: rateCheckResult.limit,
        },
      },
      { status: result.ok ? 200 : 400 },
    );
  } catch (error) {
    console.error("GET /api/brand/scores error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
        code: "GLM_INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
