/**
 * Global Error Handler
 * Centralized error handling for Next.js API routes and server actions
 */

import { NextRequest, NextResponse } from "next/server";
import { AppError, ErrorContext, isAppError } from "./app-error";
import { ErrorCode } from "./error-codes";
import { escalate } from "./recovery";

// ============================================================
// Types
// ============================================================

export interface ErrorHandlerConfig {
  /** Include stack traces in development */
  includeStackTrace: boolean;
  /** Log all errors */
  logErrors: boolean;
  /** Escalate critical errors */
  escalateCritical: boolean;
  /** Custom error transformer */
  transformError?: (error: AppError) => Record<string, unknown>;
  /** Error logging callback */
  onError?: (error: AppError, context: ErrorContext) => void;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: string;
    retryable?: boolean;
    retryAfter?: number;
  };
  success: false;
  timestamp: string;
  requestId?: string;
}

// ============================================================
// Default Configuration
// ============================================================

const defaultConfig: ErrorHandlerConfig = {
  includeStackTrace: process.env.NODE_ENV === "development",
  logErrors: true,
  escalateCritical: true,
};

// ============================================================
// Global Error Handler
// ============================================================

/**
 * Handle any error and convert to AppError
 */
export function handleError(
  error: unknown,
  context: ErrorContext = {},
  config: Partial<ErrorHandlerConfig> = {},
): AppError {
  const fullConfig = { ...defaultConfig, ...config };

  // Convert to AppError if not already
  const appError = isAppError(error)
    ? error
    : AppError.fromUnknown(error, "GLM_SYS_900", context);

  // Update context
  appError.context.requestId = context.requestId || appError.context.requestId;
  appError.context.userId = context.userId || appError.context.userId;
  appError.context.endpoint = context.endpoint || appError.context.endpoint;

  // Log error
  if (fullConfig.logErrors) {
    logError(appError);
  }

  // Callback
  if (fullConfig.onError) {
    fullConfig.onError(appError, context);
  }

  // Escalate critical errors
  if (
    fullConfig.escalateCritical &&
    (appError.severity === "critical" ||
      appError.recoveryStrategy === "escalate")
  ) {
    escalate(appError).catch((e) => console.error("Escalation failed:", e));
  }

  return appError;
}

/**
 * Log error with appropriate level
 */
function logError(error: AppError): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    code: error.code,
    message: error.message,
    severity: error.severity,
    httpStatus: error.httpStatus,
    recoveryStrategy: error.recoveryStrategy,
    context: {
      requestId: error.context.requestId,
      userId: error.context.userId,
      endpoint: error.context.endpoint,
      correlationId: error.context.correlationId,
    },
    isOperational: error.isOperational,
  };

  switch (error.severity) {
    case "critical":
      console.error("[CRITICAL ERROR]", JSON.stringify(logEntry, null, 2));
      if (error.stack) {
        console.error(error.stack);
      }
      break;
    case "high":
      console.error("[HIGH ERROR]", JSON.stringify(logEntry, null, 2));
      break;
    case "medium":
      console.warn("[MEDIUM ERROR]", JSON.stringify(logEntry, null, 2));
      break;
    case "low":
      console.log("[LOW ERROR]", JSON.stringify(logEntry, null, 2));
      break;
  }
}

// ============================================================
// Next.js API Route Handler
// ============================================================

/**
 * Create error response for API routes
 */
export function createErrorResponse(
  error: AppError,
  config: Partial<ErrorHandlerConfig> = {},
): NextResponse<ApiErrorResponse> {
  const fullConfig = { ...defaultConfig, ...config };

  const response: ApiErrorResponse = {
    error: {
      code: error.code,
      message: error.userMessage,
      retryable: error.retryable,
    },
    success: false,
    timestamp: new Date().toISOString(),
    requestId: error.context.requestId,
  };

  // Add retry-after for rate limit errors
  if (error.httpStatus === 429 && error.retryDelayMs > 0) {
    response.error.retryAfter = Math.ceil(error.retryDelayMs / 1000);
  }

  // Add stack trace in development
  if (fullConfig.includeStackTrace && error.stack) {
    response.error.details = error.stack;
  }

  // Custom transform
  if (fullConfig.transformError) {
    const transformed = fullConfig.transformError(error);
    Object.assign(response.error, transformed);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Add Retry-After header for 429
  if (error.httpStatus === 429) {
    headers["Retry-After"] = String(Math.ceil(error.retryDelayMs / 1000));
  }

  return NextResponse.json(response, {
    status: error.httpStatus,
    headers,
  });
}

/**
 * Wrap API route handler with error handling
 */
export function withErrorHandler<T>(
  handler: (req: NextRequest, context?: unknown) => Promise<NextResponse<T>>,
  config: Partial<ErrorHandlerConfig> = {},
): (
  req: NextRequest,
  context?: unknown,
) => Promise<NextResponse<T | ApiErrorResponse>> {
  return async (req: NextRequest, routeContext?: unknown) => {
    const requestId = crypto.randomUUID();

    try {
      // Add request ID to response headers
      const response = await handler(req, routeContext);
      response.headers.set("X-Request-ID", requestId);
      return response;
    } catch (error) {
      const errorContext: ErrorContext = {
        requestId,
        endpoint: req.nextUrl.pathname,
        method: req.method,
      };

      // Try to get user ID from auth header or cookie
      const authHeader = req.headers.get("authorization");
      if (authHeader) {
        // Extract user info from token if possible
        errorContext.metadata = { hasAuth: true };
      }

      const appError = handleError(error, errorContext, config);
      return createErrorResponse(appError, config);
    }
  };
}

// ============================================================
// Server Action Error Handler
// ============================================================

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

/**
 * Wrap server action with error handling
 */
export function withActionErrorHandler<TArgs extends unknown[], TReturn>(
  action: (...args: TArgs) => Promise<TReturn>,
  config: Partial<ErrorHandlerConfig> = {},
): (...args: TArgs) => Promise<ActionResult<TReturn>> {
  return async (...args: TArgs): Promise<ActionResult<TReturn>> => {
    try {
      const result = await action(...args);
      return { success: true, data: result };
    } catch (error) {
      const appError = handleError(error, {}, config);
      return {
        success: false,
        error: {
          code: appError.code,
          message: appError.userMessage,
          retryable: appError.retryable,
        },
      };
    }
  };
}

// ============================================================
// Error Boundary Helper for Client Components
// ============================================================

export interface ErrorBoundaryFallbackProps {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
  reset: () => void;
}

/**
 * Extract error info for error boundary
 */
export function extractErrorInfo(
  error: unknown,
): ErrorBoundaryFallbackProps["error"] {
  if (isAppError(error)) {
    return {
      code: error.code,
      message: error.userMessage,
      retryable: error.retryable,
    };
  }

  if (error instanceof Error) {
    return {
      code: "GLM_SYS_900",
      message: "Something went wrong. Please try again.",
      retryable: true,
    };
  }

  return {
    code: "GLM_SYS_900",
    message: "An unexpected error occurred.",
    retryable: true,
  };
}

// ============================================================
// Validation Error Helper
// ============================================================

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

/**
 * Create validation error from Zod or similar
 */
export function createValidationError(
  errors: ValidationError[],
  context?: ErrorContext,
): AppError {
  const error = new AppError("GLM_DATA_205", context);
  error.context.metadata = { validationErrors: errors };
  return error;
}

/**
 * Format Zod errors to ValidationError array
 */
export function formatZodErrors(zodError: {
  issues: Array<{ path: (string | number)[]; message: string }>;
}): ValidationError[] {
  return zodError.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

// ============================================================
// Rate Limit Helper
// ============================================================

/**
 * Create rate limit error with retry info
 */
export function createRateLimitError(
  retryAfterSeconds: number,
  context?: ErrorContext,
): AppError {
  const error = new AppError("GLM_SYS_902", context);
  error.context.metadata = {
    retryAfter: retryAfterSeconds,
    retryAfterMs: retryAfterSeconds * 1000,
  };
  return error;
}

// ============================================================
// Assertion Helpers
// ============================================================

/**
 * Assert condition or throw error
 */
export function assertOrThrow(
  condition: boolean,
  errorCode: ErrorCode,
  context?: ErrorContext,
): asserts condition {
  if (!condition) {
    throw new AppError(errorCode, context);
  }
}

/**
 * Assert value is defined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  errorCode: ErrorCode,
  context?: ErrorContext,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new AppError(errorCode, context);
  }
}

/**
 * Assert user is authenticated
 */
export function assertAuthenticated(
  userId: string | null | undefined,
  context?: ErrorContext,
): asserts userId is string {
  if (!userId) {
    throw new AppError("GLM_AUTH_001", context);
  }
}

// ============================================================
// Try-Catch Wrapper
// ============================================================

/**
 * Safe execution wrapper that catches and transforms errors
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  fallbackErrorCode: ErrorCode = "GLM_SYS_900",
  context?: ErrorContext,
): Promise<[T, null] | [null, AppError]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (error) {
    const appError = AppError.fromUnknown(error, fallbackErrorCode, context);
    return [null, appError];
  }
}

/**
 * Sync version of tryCatch
 */
export function tryCatchSync<T>(
  fn: () => T,
  fallbackErrorCode: ErrorCode = "GLM_SYS_900",
  context?: ErrorContext,
): [T, null] | [null, AppError] {
  try {
    const result = fn();
    return [result, null];
  } catch (error) {
    const appError = AppError.fromUnknown(error, fallbackErrorCode, context);
    return [null, appError];
  }
}
