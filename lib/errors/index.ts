/**
 * Error Handling Module
 * Centralized error management for Glimad application
 *
 * Usage:
 * ```typescript
 * import {
 *   AppError,
 *   authError,
 *   withRetry,
 *   withErrorHandler,
 *   databaseCircuitBreaker,
 * } from "@/lib/errors";
 *
 * // Throw typed error
 * throw new AppError("GLM_AUTH_001", { userId: "123" });
 *
 * // Use factory function
 * throw authError("GLM_AUTH_002");
 *
 * // Wrap API route
 * export const GET = withErrorHandler(async (req) => {
 *   // ...
 * });
 *
 * // Use circuit breaker
 * const data = await databaseCircuitBreaker.execute(() => fetchFromDB());
 *
 * // Retry with backoff
 * const result = await withRetry(() => callExternalAPI(), { maxRetries: 3 });
 * ```
 */

// Error Codes
export {
  // Types
  type ErrorSeverity,
  type RecoveryStrategy,
  type ErrorCodeDefinition,
  type ErrorCode,
  // Error code collections
  AUTH_ERRORS,
  USER_ERRORS,
  DATA_ERRORS,
  API_ERRORS,
  PAYMENT_ERRORS,
  MISSION_ERRORS,
  BRAIN_ERRORS,
  SCRAPE_ERRORS,
  STUDIO_ERRORS,
  SYSTEM_ERRORS,
  ERROR_CATALOG,
  // Helper functions
  getErrorDefinition,
  isRetryable,
  getHttpStatus,
  getUserMessage,
  getRecoveryStrategy,
} from "./error-codes";

// App Error Class
export {
  // Types
  type ErrorContext,
  // Class
  AppError,
  // Factory functions
  authError,
  userError,
  dataError,
  paymentError,
  missionError,
  brainError,
  scrapeError,
  studioError,
  systemError,
  // Type guards
  isAppError,
  isOperationalError,
  hasErrorCode,
  isValidErrorCode,
} from "./app-error";

// Circuit Breaker
export {
  // Types
  type CircuitState,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,
  // Class
  CircuitBreaker,
  // Registry
  circuitBreakerRegistry,
  // Pre-configured breakers
  databaseCircuitBreaker,
  claudeCircuitBreaker,
  stripeCircuitBreaker,
  scrapeCircuitBreaker,
  // Helpers
  createCircuitBreaker,
  withCircuitBreaker,
  withCircuitBreakerFallback,
} from "./circuit-breaker";

// Recovery Strategies
export {
  // Types
  type RetryConfig,
  type DegradeConfig,
  type QueueConfig,
  type QueueItem,
  type EscalateConfig,
  type RecoveryOptions,
  // Retry
  withRetry,
  retryable,
  // Degrade
  withDegrade,
  degradable,
  // Queue
  getOrCreateQueue,
  withQueue,
  // Escalate
  escalate,
  withEscalation,
  // Combined
  withRecovery,
  recoverableOperation,
} from "./recovery";

// Error Handler
export {
  // Types
  type ErrorHandlerConfig,
  type ApiErrorResponse,
  type ActionResult,
  type ErrorBoundaryFallbackProps,
  type ValidationError,
  // Handler functions
  handleError,
  createErrorResponse,
  withErrorHandler,
  withActionErrorHandler,
  extractErrorInfo,
  // Validation
  createValidationError,
  formatZodErrors,
  // Rate limit
  createRateLimitError,
  // Assertions
  assertOrThrow,
  assertDefined,
  assertAuthenticated,
  // Try-catch
  tryCatch,
  tryCatchSync,
} from "./error-handler";
