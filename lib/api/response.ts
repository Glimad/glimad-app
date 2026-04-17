/**
 * lib/api/response.ts
 * Brief 27: API Reference — Standardised response format
 *
 * All API routes must use these helpers to ensure consistent:
 *  { ok: true, data: ... } | { ok: false, error: { code, message, details? } }
 */

import { NextResponse } from "next/server";

// ============================================================================
// GLM ERROR CODES (from Brief 27 spec)
// ============================================================================

export const GLM = {
  // Auth
  AUTH_MISSING: { code: "GLM_AUTH_MISSING", status: 401 },
  AUTH_INVALID: { code: "GLM_AUTH_INVALID", status: 401 },
  AUTH_EMAIL_EXISTS: { code: "GLM_AUTH_EMAIL_EXISTS", status: 409 },

  // Projects
  PROJECT_NOT_FOUND: { code: "GLM_PROJECT_NOT_FOUND", status: 404 },
  PROJECT_ACCESS_DENIED: { code: "GLM_PROJECT_ACCESS_DENIED", status: 403 },

  // Billing
  NO_ACTIVE_SUBSCRIPTION: { code: "GLM_NO_ACTIVE_SUBSCRIPTION", status: 402 },
  INSUFFICIENT_CREDITS: { code: "GLM_INSUFFICIENT_CREDITS", status: 402 },

  // Missions
  MISSION_ON_COOLDOWN: { code: "GLM_MISSION_ON_COOLDOWN", status: 429 },
  PHASE_NOT_ELIGIBLE: { code: "GLM_PHASE_NOT_ELIGIBLE", status: 403 },
  MISSION_NOT_FOUND: { code: "GLM_MISSION_NOT_FOUND", status: 404 },

  // Monetization
  PRODUCT_NOT_FOUND: { code: "GLM_PRODUCT_NOT_FOUND", status: 404 },
  PRODUCT_DUPLICATE: { code: "GLM_PRODUCT_DUPLICATE", status: 409 },
  EVENT_DUPLICATE: { code: "GLM_EVENT_DUPLICATE", status: 409 },
  INVALID_PRODUCT_TYPE: { code: "GLM_INVALID_PRODUCT_TYPE", status: 400 },
  INVALID_PLATFORM: { code: "GLM_INVALID_PLATFORM", status: 400 },

  // Validation
  INVALID_REQUEST: { code: "GLM_INVALID_REQUEST", status: 400 },
  MISSING_FIELD: { code: "GLM_MISSING_FIELD", status: 400 },

  // System
  RATE_LIMITED: { code: "GLM_RATE_LIMITED", status: 429 },
  INTERNAL_ERROR: { code: "GLM_INTERNAL_ERROR", status: 500 },
  NOT_FOUND: { code: "GLM_NOT_FOUND", status: 404 },
} as const;

export type GlmErrorKey = keyof typeof GLM;

// ============================================================================
// RESPONSE BUILDERS
// ============================================================================

/** Successful response: { ok: true, data } */
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

/** Created response: { ok: true, data } with 201 */
export function created<T>(data: T): NextResponse {
  return NextResponse.json({ ok: true, data }, { status: 201 });
}

/** Paginated list response */
export function okList<T>(
  items: T[],
  pagination: {
    cursor: string | null;
    has_more: boolean;
    total_count?: number;
  },
): NextResponse {
  return NextResponse.json({
    ok: true,
    data: items,
    pagination,
  });
}

/** Error response: { ok: false, error: { code, message, details? } } */
export function err(
  glmError: (typeof GLM)[GlmErrorKey],
  message?: string,
  details?: Record<string, unknown>,
): NextResponse {
  const body: Record<string, unknown> = {
    ok: false,
    error: {
      code: glmError.code,
      message: message ?? glmError.code.replace(/GLM_|_/g, " ").trim(),
    },
  };
  if (details) (body.error as Record<string, unknown>).details = details;
  return NextResponse.json(body, { status: glmError.status });
}

/** Shorthand: 401 Unauthorized */
export function unauthorized(message = "Unauthorized"): NextResponse {
  return err(GLM.AUTH_MISSING, message);
}

/** Shorthand: 404 Not Found */
export function notFound(resource = "Resource"): NextResponse {
  return err(GLM.NOT_FOUND, `${resource} not found`);
}

/** Shorthand: 400 Bad Request */
export function badRequest(
  message: string,
  details?: Record<string, unknown>,
): NextResponse {
  return err(GLM.INVALID_REQUEST, message, details);
}

/** Shorthand: 500 Internal Server Error (logs the actual error server-side) */
export function internalError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[API]", message);
  return err(GLM.INTERNAL_ERROR, "An unexpected error occurred");
}
