/**
 * Custom Application Error Class
 * Provides structured error handling with error codes, context, and recovery metadata
 */

import {
  ErrorCode,
  ErrorSeverity,
  RecoveryStrategy,
  getErrorDefinition,
  ERROR_CATALOG,
} from "./error-codes";

// ============================================================
// Error Context Interface
// ============================================================

export interface ErrorContext {
  userId?: string;
  requestId?: string;
  correlationId?: string;
  endpoint?: string;
  method?: string;
  params?: Record<string, unknown>;
  timestamp?: Date;
  stackTrace?: string;
  originalError?: Error;
  metadata?: Record<string, unknown>;
}

// ============================================================
// AppError Class
// ============================================================

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly severity: ErrorSeverity;
  public readonly recoveryStrategy: RecoveryStrategy;
  public readonly retryable: boolean;
  public readonly maxRetries: number;
  public readonly retryDelayMs: number;
  public readonly userMessage: string;
  public readonly internalDescription: string;
  public readonly context: ErrorContext;
  public readonly timestamp: Date;
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    context: ErrorContext = {},
    customMessage?: string,
  ) {
    const definition = getErrorDefinition(code);
    super(customMessage || definition.message);

    this.name = "AppError";
    this.code = code;
    this.httpStatus = definition.httpStatus;
    this.severity = definition.severity;
    this.recoveryStrategy = definition.recoveryStrategy;
    this.retryable = definition.retryable;
    this.maxRetries = definition.maxRetries;
    this.retryDelayMs = definition.retryDelayMs;
    this.userMessage = definition.userMessage;
    this.internalDescription = definition.internalDescription;
    this.timestamp = context.timestamp || new Date();
    this.isOperational = true; // Distinguishes expected errors from programming errors

    this.context = {
      ...context,
      timestamp: this.timestamp,
      stackTrace: this.stack,
    };

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Create error from unknown caught error
   */
  static fromUnknown(
    error: unknown,
    fallbackCode: ErrorCode = "GLM_SYS_900",
    context: ErrorContext = {},
  ): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      const appError = new AppError(fallbackCode, {
        ...context,
        originalError: error,
        stackTrace: error.stack,
      });
      appError.message = error.message;
      return appError;
    }

    return new AppError(fallbackCode, {
      ...context,
      metadata: { originalValue: String(error) },
    });
  }

  /**
   * Create error from Supabase error
   */
  static fromSupabaseError(
    error: { message: string; code?: string; details?: string; hint?: string },
    context: ErrorContext = {},
  ): AppError {
    // Map Supabase error codes to our error codes
    const supabaseErrorMap: Record<string, ErrorCode> = {
      "23505": "GLM_DATA_203", // unique_violation
      "23503": "GLM_DATA_204", // foreign_key_violation
      "42501": "GLM_DATA_207", // RLS violation
      PGRST116: "GLM_DATA_202", // no rows returned
      "42P01": "GLM_DATA_200", // undefined_table
    };

    const errorCode = error.code
      ? supabaseErrorMap[error.code] || "GLM_DATA_200"
      : "GLM_DATA_200";

    return new AppError(errorCode, {
      ...context,
      metadata: {
        supabaseCode: error.code,
        details: error.details,
        hint: error.hint,
      },
    });
  }

  /**
   * Create error from Stripe error
   */
  static fromStripeError(
    error: { type?: string; code?: string; message: string },
    context: ErrorContext = {},
  ): AppError {
    const stripeErrorMap: Record<string, ErrorCode> = {
      card_error: "GLM_PAY_401",
      invalid_request_error: "GLM_PAY_400",
      api_connection_error: "GLM_PAY_407",
      api_error: "GLM_PAY_407",
      authentication_error: "GLM_PAY_407",
      rate_limit_error: "GLM_PAY_407",
    };

    const errorCode = error.type
      ? stripeErrorMap[error.type] || "GLM_PAY_400"
      : "GLM_PAY_400";

    return new AppError(errorCode, {
      ...context,
      metadata: {
        stripeType: error.type,
        stripeCode: error.code,
        stripeMessage: error.message,
      },
    });
  }

  /**
   * Create error from HTTP response
   */
  static fromHttpResponse(
    status: number,
    body: unknown,
    context: ErrorContext = {},
  ): AppError {
    const statusCodeMap: Record<number, ErrorCode> = {
      400: "GLM_SYS_903",
      401: "GLM_AUTH_001",
      403: "GLM_AUTH_004",
      404: "GLM_DATA_202",
      405: "GLM_SYS_904",
      408: "GLM_SYS_908",
      409: "GLM_DATA_203",
      429: "GLM_SYS_902",
      500: "GLM_SYS_900",
      502: "GLM_API_300",
      503: "GLM_SYS_901",
      504: "GLM_API_304",
    };

    const errorCode = statusCodeMap[status] || "GLM_SYS_900";

    return new AppError(errorCode, {
      ...context,
      metadata: { httpStatus: status, responseBody: body },
    });
  }

  /**
   * Check if this error should be retried
   */
  shouldRetry(attemptNumber: number): boolean {
    return this.retryable && attemptNumber < this.maxRetries;
  }

  /**
   * Get delay before next retry (with exponential backoff)
   */
  getRetryDelay(attemptNumber: number): number {
    return this.retryDelayMs * Math.pow(2, attemptNumber);
  }

  /**
   * Convert to JSON for logging/API responses
   */
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      severity: this.severity,
      recoveryStrategy: this.recoveryStrategy,
      userMessage: this.userMessage,
      timestamp: this.timestamp.toISOString(),
      context: {
        requestId: this.context.requestId,
        correlationId: this.context.correlationId,
        endpoint: this.context.endpoint,
        method: this.context.method,
      },
    };
  }

  /**
   * Convert to user-safe response (hides internal details)
   */
  toUserResponse(): {
    error: string;
    code: string;
    message: string;
    retryable: boolean;
  } {
    return {
      error: this.code,
      code: this.code,
      message: this.userMessage,
      retryable: this.retryable,
    };
  }

  /**
   * Convert to detailed log entry
   */
  toLogEntry(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      severity: this.severity,
      recoveryStrategy: this.recoveryStrategy,
      retryable: this.retryable,
      isOperational: this.isOperational,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
    };
  }
}

// ============================================================
// Error Factory Functions
// ============================================================

/**
 * Create authentication error
 */
export function authError(
  code: Extract<
    ErrorCode,
    | "GLM_AUTH_001"
    | "GLM_AUTH_002"
    | "GLM_AUTH_003"
    | "GLM_AUTH_004"
    | "GLM_AUTH_005"
    | "GLM_AUTH_006"
    | "GLM_AUTH_007"
    | "GLM_AUTH_008"
    | "GLM_AUTH_009"
  >,
  context?: ErrorContext,
): AppError {
  return new AppError(code, context);
}

/**
 * Create user error
 */
export function userError(
  code: Extract<
    ErrorCode,
    | "GLM_USER_100"
    | "GLM_USER_101"
    | "GLM_USER_102"
    | "GLM_USER_103"
    | "GLM_USER_104"
    | "GLM_USER_105"
  >,
  context?: ErrorContext,
): AppError {
  return new AppError(code, context);
}

/**
 * Create data error
 */
export function dataError(
  code: Extract<
    ErrorCode,
    | "GLM_DATA_200"
    | "GLM_DATA_201"
    | "GLM_DATA_202"
    | "GLM_DATA_203"
    | "GLM_DATA_204"
    | "GLM_DATA_205"
    | "GLM_DATA_206"
    | "GLM_DATA_207"
  >,
  context?: ErrorContext,
): AppError {
  return new AppError(code, context);
}

/**
 * Create payment error
 */
export function paymentError(
  code: Extract<
    ErrorCode,
    | "GLM_PAY_400"
    | "GLM_PAY_401"
    | "GLM_PAY_402"
    | "GLM_PAY_403"
    | "GLM_PAY_404"
    | "GLM_PAY_405"
    | "GLM_PAY_406"
    | "GLM_PAY_407"
    | "GLM_PAY_408"
  >,
  context?: ErrorContext,
): AppError {
  return new AppError(code, context);
}

/**
 * Create mission error
 */
export function missionError(
  code: Extract<
    ErrorCode,
    | "GLM_MISSION_500"
    | "GLM_MISSION_501"
    | "GLM_MISSION_502"
    | "GLM_MISSION_503"
    | "GLM_MISSION_504"
    | "GLM_MISSION_505"
    | "GLM_MISSION_506"
  >,
  context?: ErrorContext,
): AppError {
  return new AppError(code, context);
}

/**
 * Create brain error
 */
export function brainError(
  code: Extract<
    ErrorCode,
    | "GLM_BRAIN_600"
    | "GLM_BRAIN_601"
    | "GLM_BRAIN_602"
    | "GLM_BRAIN_603"
    | "GLM_BRAIN_604"
    | "GLM_BRAIN_605"
    | "GLM_BRAIN_606"
  >,
  context?: ErrorContext,
): AppError {
  return new AppError(code, context);
}

/**
 * Create scrape error
 */
export function scrapeError(
  code: Extract<
    ErrorCode,
    | "GLM_SCRAPE_700"
    | "GLM_SCRAPE_701"
    | "GLM_SCRAPE_702"
    | "GLM_SCRAPE_703"
    | "GLM_SCRAPE_704"
    | "GLM_SCRAPE_705"
    | "GLM_SCRAPE_706"
    | "GLM_SCRAPE_707"
  >,
  context?: ErrorContext,
): AppError {
  return new AppError(code, context);
}

/**
 * Create studio error
 */
export function studioError(
  code: Extract<
    ErrorCode,
    | "GLM_STUDIO_800"
    | "GLM_STUDIO_801"
    | "GLM_STUDIO_802"
    | "GLM_STUDIO_803"
    | "GLM_STUDIO_804"
    | "GLM_STUDIO_805"
  >,
  context?: ErrorContext,
): AppError {
  return new AppError(code, context);
}

/**
 * Create system error
 */
export function systemError(
  code: Extract<
    ErrorCode,
    | "GLM_SYS_900"
    | "GLM_SYS_901"
    | "GLM_SYS_902"
    | "GLM_SYS_903"
    | "GLM_SYS_904"
    | "GLM_SYS_905"
    | "GLM_SYS_906"
    | "GLM_SYS_907"
    | "GLM_SYS_908"
    | "GLM_SYS_909"
  >,
  context?: ErrorContext,
): AppError {
  return new AppError(code, context);
}

// ============================================================
// Type Guards
// ============================================================

/**
 * Check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Check if error is operational (expected error vs programming bug)
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Check if error has specific code
 */
export function hasErrorCode(error: unknown, code: ErrorCode): boolean {
  return error instanceof AppError && error.code === code;
}

/**
 * Check if error code exists in catalog
 */
export function isValidErrorCode(code: string): code is ErrorCode {
  return code in ERROR_CATALOG;
}
