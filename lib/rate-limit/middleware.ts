/**
 * Rate Limiting Middleware
 * Next.js API route middleware for rate limiting
 */

import { NextRequest, NextResponse } from "next/server";
import { getRateLimiter } from "./rate-limiter";
import {
  RateLimitMiddlewareConfig,
  RequestContext,
  RateLimitRule,
  RateLimitStatus,
  UserTier,
} from "./types";

// ============================================================
// Middleware Configuration
// ============================================================

const DEFAULT_CONFIG: Required<RateLimitMiddlewareConfig> = {
  skipPaths: [
    "/api/health",
    "/api/stripe/webhook", // Webhooks have their own signature verification
    "/_next",
    "/favicon.ico",
  ],
  keyGenerator: (ctx) => ctx.userId || ctx.ipAddress,
  onRateLimited: () => {},
  skip: () => false,
};

// ============================================================
// Request Context Extraction
// ============================================================

/**
 * Extract request context from NextRequest
 */
export function extractRequestContext(
  request: NextRequest,
  userId?: string,
  tier?: UserTier,
): RequestContext {
  // Get IP address from various headers
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");

  const ipAddress =
    cfConnectingIp ||
    realIp ||
    (forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1");

  // Get user agent
  const userAgent = request.headers.get("user-agent") || undefined;

  // Get API key if present
  const apiKey =
    request.headers.get("x-api-key") ||
    request.headers.get("authorization")?.replace("Bearer ", "") ||
    undefined;

  // Extract headers for logging
  const headerObj: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    // Skip sensitive headers
    if (!["cookie", "authorization", "x-api-key"].includes(key.toLowerCase())) {
      headerObj[key] = value;
    }
  });

  return {
    userId,
    ipAddress,
    userAgent,
    apiKey,
    endpoint: request.nextUrl.pathname,
    method: request.method,
    tier,
    headers: headerObj,
  };
}

// ============================================================
// Rate Limited Response
// ============================================================

/**
 * Create a rate limited response (429)
 */
export function createRateLimitedResponse(
  status: RateLimitStatus,
): NextResponse {
  const response = NextResponse.json(
    {
      error: {
        code: "GLM_SYS_902",
        message: "Rate limit exceeded",
        retryAfter: status.retryAfter,
        limit: status.limit,
        resetAt: status.resetAt.toISOString(),
      },
    },
    { status: 429 },
  );

  // Add rate limit headers
  const limiter = getRateLimiter();
  const headers = limiter.getHeaders(status);

  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

// ============================================================
// Middleware Factory
// ============================================================

/**
 * Create rate limiting middleware for API routes
 */
export function createRateLimitMiddleware(config?: RateLimitMiddlewareConfig) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const limiter = getRateLimiter();

  return async function rateLimitMiddleware(
    request: NextRequest,
    userId?: string,
    tier?: UserTier,
    customRule?: RateLimitRule,
  ): Promise<NextResponse | null> {
    const pathname = request.nextUrl.pathname;

    // Check skip paths
    if (mergedConfig.skipPaths.some((p) => pathname.startsWith(p))) {
      return null;
    }

    // Extract context
    const context = extractRequestContext(request, userId, tier);

    // Check custom skip function
    if (mergedConfig.skip(context)) {
      return null;
    }

    // Check rate limit
    const status = await limiter.checkLimit(context, customRule);

    if (!status.allowed) {
      // Call custom handler
      mergedConfig.onRateLimited(status);

      return createRateLimitedResponse(status);
    }

    // Consume the token
    await limiter.consume(context, customRule);

    return null;
  };
}

// ============================================================
// HOF for API Route Handlers
// ============================================================

type ApiHandler = (
  request: NextRequest,
  context?: { params?: Record<string, string> },
) => Promise<NextResponse>;

/**
 * Wrap an API route handler with rate limiting
 */
export function withRateLimit(
  handler: ApiHandler,
  options?: {
    rule?: RateLimitRule;
    getUserId?: (request: NextRequest) => Promise<string | undefined>;
    getTier?: (request: NextRequest) => Promise<UserTier | undefined>;
  },
): ApiHandler {
  const middleware = createRateLimitMiddleware();

  return async (request, handlerContext) => {
    const userId = options?.getUserId
      ? await options.getUserId(request)
      : undefined;
    const tier = options?.getTier ? await options.getTier(request) : undefined;

    const rateLimitResponse = await middleware(
      request,
      userId,
      tier,
      options?.rule,
    );

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    return handler(request, handlerContext);
  };
}

// ============================================================
// Edge Middleware Support
// ============================================================

/**
 * Rate limit check for Edge Middleware (middleware.ts)
 * Note: Uses in-memory only (no database in edge runtime)
 */
export async function edgeRateLimitCheck(
  request: NextRequest,
): Promise<{ allowed: boolean; response?: NextResponse }> {
  const context = extractRequestContext(request);
  const limiter = getRateLimiter();

  // Check blocklist
  if (await limiter.isBlocked(context.ipAddress)) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: {
            code: "GLM_SYS_903",
            message: "IP address blocked",
          },
        },
        { status: 403 },
      ),
    };
  }

  // Check rate limit
  const status = await limiter.checkLimit(context);

  if (!status.allowed) {
    return {
      allowed: false,
      response: createRateLimitedResponse(status),
    };
  }

  return { allowed: true };
}

// ============================================================
// Response Helper
// ============================================================

/**
 * Add rate limit headers to an existing response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  status: RateLimitStatus,
): NextResponse {
  const limiter = getRateLimiter();
  const headers = limiter.getHeaders(status);

  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

// ============================================================
// Default Middleware Instance
// ============================================================

export const rateLimitMiddleware = createRateLimitMiddleware();
