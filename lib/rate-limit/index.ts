/**
 * Rate Limiting Module
 *
 * Provides comprehensive rate limiting for API endpoints:
 * - Sliding window algorithm (default)
 * - Token bucket algorithm (for burst handling)
 * - In-memory and database-backed storage
 * - IP blocklist management
 * - Violation logging and auto-blocking
 * - Next.js middleware integration
 *
 * Database: supabase/migrations/025_rate_limiting.sql
 */

// Service
export {
  RateLimiter,
  getRateLimiter,
  checkRateLimit,
  getRateLimitHeaders,
} from "./rate-limiter";

// Middleware
export {
  createRateLimitMiddleware,
  rateLimitMiddleware,
  withRateLimit,
  edgeRateLimitCheck,
  extractRequestContext,
  createRateLimitedResponse,
  addRateLimitHeaders,
} from "./middleware";

// Types - Configuration
export type {
  RateLimitConfig,
  RateLimitRule,
  RateLimiterOptions,
  RateLimitMiddlewareConfig,
} from "./types";

// Types - Status
export type {
  RateLimitStatus,
  RateLimitHeaders,
  RateLimitResponse,
  RateLimitError,
} from "./types";

// Types - Entries
export type {
  RateLimitEntry,
  RateLimitViolation,
  BlocklistEntry,
} from "./types";

// Types - Request
export type { IdentifierType, UserTier, RequestContext } from "./types";

// Types - Algorithms
export type {
  RateLimitAlgorithm,
  TokenBucketState,
  SlidingWindowState,
} from "./types";
