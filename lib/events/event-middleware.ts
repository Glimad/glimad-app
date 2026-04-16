/**
 * Event Tracking Middleware
 * Auto-captures API events, errors, and performance metrics
 * Integrates with Express/Next.js request/response lifecycle
 */

import { NextRequest, NextResponse } from "next/server";
import { getEventLogger } from "./event-logger";
import {
  SystemEvent,
  EventContext,
  ErrorOccurredEvent,
  RateLimitExceededEvent,
} from "./event-types";

// Helper to generate UUID (native crypto)
function generateUUID(): string {
  return crypto.randomUUID();
}

// ============================================================
// Context Storage
// ============================================================

const contextStorage = new Map<string, EventContext>();

/**
 * Generate or retrieve correlation ID for request
 */
export function getCorrelationId(request: NextRequest): string {
  const correlationId =
    (request.headers.get("x-correlation-id") as string) ||
    (request.headers.get("x-request-id") as string) ||
    generateUUID();

  return correlationId;
}

/**
 * Extract context from Next.js request
 */
export function extractEventContext(
  request: NextRequest,
  responseStatus?: number,
): EventContext {
  const correlationId = getCorrelationId(request);
  const traceId =
    (request.headers.get("x-trace-id") as string) || generateUUID();
  const spanId = (request.headers.get("x-span-id") as string) || generateUUID();

  const userIdHeader = request.headers.get("x-user-id");
  const projectIdHeader = request.headers.get("x-project-id");
  const userId = userIdHeader || undefined;
  const projectId = projectIdHeader || undefined;

  const url = new URL(request.url);
  const ipAddress = (
    request.headers.get("x-forwarded-for") ||
    request.headers.get("cf-connecting-ip") ||
    request.ip ||
    "unknown"
  ).split(",")[0];

  return {
    correlationId,
    traceId,
    spanId,
    userId,
    projectId,
    ipAddress,
    userAgent: request.headers.get("user-agent") || undefined,
    httpMethod: request.method,
    httpPath: url.pathname,
    httpStatusCode: responseStatus,
    source: "api",
  };
}

/**
 * Next.js Middleware for API Routes
 * Use in middleware.ts to capture all requests
 */
export function eventTrackingMiddleware(request: NextRequest): EventContext {
  const context = extractEventContext(request);
  const correlationId = context.correlationId!;

  // Store context for later retrieval in handlers
  contextStorage.set(correlationId, context);

  // Add context headers to request for downstream handlers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-correlation-id", correlationId);
  requestHeaders.set("x-trace-id", context.traceId || generateUUID());
  requestHeaders.set("x-span-id", context.spanId || generateUUID());

  return context;
}

/**
 * API Route Wrapper - Automatically track requests and responses
 */
export function withEventTracking(
  handler: (req: NextRequest, context: EventContext) => Promise<NextResponse>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now();
    const context = extractEventContext(req);
    const correlationId = context.correlationId!;

    try {
      // Call the actual handler
      const response = await handler(req, context);

      // Update context with response status
      context.httpStatusCode = response.status;

      // Log successful request
      if (response.status >= 400) {
        await logRequestError(req, response.status, context);
      }

      // Add context headers to response
      response.headers.set("x-correlation-id", correlationId);
      response.headers.set("x-trace-id", context.traceId || "");
      response.headers.set("x-span-id", context.spanId || "");

      // Log performance metrics
      const duration = Date.now() - startTime;
      if (duration > 5000) {
        // Log if over 5 seconds
        await logSlowRequest(req, duration, context);
      }

      return response;
    } catch (error) {
      // Update context with error status
      context.httpStatusCode = 500;

      // Log error
      await logRequestException(req, error, context);

      // Return error response
      const response = new NextResponse(
        JSON.stringify({
          error: "Internal Server Error",
          correlationId: correlationId,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "x-correlation-id": correlationId,
          },
        },
      );

      return response;
    } finally {
      // Cleanup context
      contextStorage.delete(correlationId);
    }
  };
}

/**
 * Log API request errors
 */
async function logRequestError(
  request: NextRequest,
  statusCode: number,
  context: EventContext,
): Promise<void> {
  try {
    const eventLogger = getEventLogger();

    let errorMessage = `HTTP ${statusCode}`;
    if (statusCode === 401) {
      errorMessage = "Unauthorized";
    } else if (statusCode === 403) {
      errorMessage = "Forbidden";
    } else if (statusCode === 404) {
      errorMessage = "Not Found";
    } else if (statusCode === 429) {
      errorMessage = "Too Many Requests";
    } else if (statusCode >= 500) {
      errorMessage = "Server Error";
    }

    const errorEvent: ErrorOccurredEvent = {
      eventType: "error_occurred",
      category: "error",
      severity: statusCode >= 500 ? "error" : "warning",
      payload: {
        errorCode: `HTTP_${statusCode}`,
        errorMessage,
        severity: statusCode >= 500 ? "high" : "medium",
      },
    };

    await eventLogger.logEvent(errorEvent, context);
  } catch (error) {
    console.error("EventMiddleware: Error logging request error", error);
  }
}

/**
 * Log slow requests (performance issue)
 */
async function logSlowRequest(
  request: NextRequest,
  durationMs: number,
  context: EventContext,
): Promise<void> {
  try {
    const eventLogger = getEventLogger();

    const errorEvent: ErrorOccurredEvent = {
      eventType: "error_occurred",
      category: "error",
      severity: "warning",
      payload: {
        errorCode: "SLOW_REQUEST",
        errorMessage: `Request took ${durationMs}ms`,
        severity: "medium",
        context: {
          durationMs,
          path: context.httpPath,
          method: context.httpMethod,
        },
      },
    };

    await eventLogger.logEvent(errorEvent, context);
  } catch (error) {
    console.error("EventMiddleware: Error logging slow request", error);
  }
}

/**
 * Log request exceptions
 */
async function logRequestException(
  request: NextRequest,
  error: unknown,
  context: EventContext,
): Promise<void> {
  try {
    const eventLogger = getEventLogger();

    const errorMessage = error instanceof Error ? error.message : String(error);
    const stackTrace = error instanceof Error ? error.stack : undefined;

    const errorEvent: ErrorOccurredEvent = {
      eventType: "error_occurred",
      category: "error",
      severity: "critical",
      payload: {
        errorCode: "HANDLER_EXCEPTION",
        errorMessage,
        stackTrace,
        severity: "critical",
        context: {
          path: context.httpPath,
          method: context.httpMethod,
        },
      },
    };

    await eventLogger.logEvent(errorEvent, context);
  } catch (logError) {
    console.error("EventMiddleware: Error logging exception", logError);
  }
}

/**
 * Manually log an event within a request handler
 */
export async function logEventInHandler(
  event: SystemEvent,
  request?: NextRequest,
): Promise<void> {
  try {
    const context = request ? extractEventContext(request) : undefined;
    const eventLogger = getEventLogger();
    await eventLogger.logEvent(event, context);
  } catch (error) {
    console.error("EventMiddleware: Error logging event in handler", error);
  }
}

/**
 * Rate Limit Event Logging
 * Call when user hits rate limits
 */
export async function logRateLimitEvent(
  userId: string,
  endpoint: string,
  limit: number,
  resetAfterSeconds: number,
  planType: "BASE" | "PRO" | "ELITE" | "FREE",
  context?: EventContext,
): Promise<void> {
  try {
    const eventLogger = getEventLogger();

    const rateLimitEvent: RateLimitExceededEvent = {
      eventType: "rate_limit_exceeded",
      category: "error",
      severity: "warning",
      payload: {
        userId,
        endpoint,
        limit,
        currentUsage: limit + 1,
        resetAfterSeconds,
        planType,
      },
    };

    await eventLogger.logEvent(rateLimitEvent, {
      ...context,
      userId,
      source: "api",
    });
  } catch (error) {
    console.error("EventMiddleware: Error logging rate limit event", error);
  }
}

/**
 * Helper to add context to response headers
 */
export function addContextHeaders(
  response: NextResponse,
  context: EventContext,
): NextResponse {
  response.headers.set("x-correlation-id", context.correlationId || "");
  response.headers.set("x-trace-id", context.traceId || "");
  response.headers.set("x-span-id", context.spanId || "");
  return response;
}

/**
 * Parse correlation ID from request
 */
export function parseCorrelationId(request: NextRequest): string {
  return (request.headers.get("x-correlation-id") as string) || generateUUID();
}

// ============================================================
// Express Adapter (for Supabase Edge Functions)
// ============================================================

// Express-like request interface
interface ExpressLikeRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  connection?: { remoteAddress?: string };
  method: string;
  path: string;
  eventContext?: EventContext;
  startTime?: number;
}

// Express-like response interface
interface ExpressLikeResponse {
  statusCode: number;
  on: (event: string, callback: () => void) => void;
  set: (name: string, value: string) => void;
}

// Express-like next function
type ExpressLikeNext = () => void;

export function createExpressEventMiddleware() {
  return (
    req: ExpressLikeRequest,
    res: ExpressLikeResponse,
    next: ExpressLikeNext,
  ) => {
    const correlationId =
      (req.headers["x-correlation-id"] as string) || generateUUID();
    const traceId = (req.headers["x-trace-id"] as string) || generateUUID();
    const spanId = (req.headers["x-span-id"] as string) || generateUUID();

    const userId = req.headers["x-user-id"] as string | undefined;
    const projectId = req.headers["x-project-id"] as string | undefined;

    const context: EventContext = {
      correlationId,
      traceId,
      spanId,
      userId,
      projectId,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers["user-agent"] as string | undefined,
      httpMethod: req.method,
      httpPath: req.path,
      source: "edge_function",
    };

    req.eventContext = context;

    // Store start time for duration tracking
    req.startTime = Date.now();

    res.on("finish", () => {
      context.httpStatusCode = res.statusCode;
      contextStorage.set(correlationId, context);
    });

    // Add context headers to response
    res.set("x-correlation-id", correlationId);
    res.set("x-trace-id", traceId);
    res.set("x-span-id", spanId);

    next();
  };
}
