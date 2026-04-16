/**
 * app/api/brand/profiles/[id]/route.ts
 * GET /api/brand/profiles/:id - Get single profile details
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BrandAPIHandlers } from "@/lib/brand-api-handlers";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
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

    // Call handler
    const result = await BrandAPIHandlers.handleGetProfileDetail(
      admin,
      params.id,
    );

    // Log usage
    const responseTimeMs = Date.now() - startTime;
    await BrandAPIHandlers.logAPIUsage(
      admin,
      keyValidation.key.id,
      keyValidation.key.tier,
      `/api/brand/profiles/${params.id}`,
      "GET",
      result.ok ? 200 : 404,
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
      { status: result.ok ? 200 : 404 },
    );
  } catch (error) {
    console.error(`GET /api/brand/profiles/${params.id} error:`, error);
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
