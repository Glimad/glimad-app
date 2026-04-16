/**
 * Rate Limiting Types
 * Brief 4: Rate Limiting Infrastructure
 */

// ============================================================
// Identifier Types
// ============================================================

export type IdentifierType = "user_id" | "ip" | "api_key" | "anonymous";

export type UserTier = "starter" | "growth" | "scale" | "default";

// ============================================================
// Rate Limit Configuration
// ============================================================

export interface RateLimitConfig {
  id: string;
  name: string;
  endpointPattern: string;
  maxRequests: number;
  windowSeconds: number;
  burstLimit: number | null;
  tier: UserTier;
  enabled: boolean;
  bypassRoles: string[];
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RateLimitRule {
  name: string;
  maxRequests: number;
  windowSeconds: number;
  burstLimit?: number;
  tier?: UserTier;
  bypassRoles?: string[];
}

// ============================================================
// Rate Limit Entry (Counter)
// ============================================================

export interface RateLimitEntry {
  id: string;
  identifier: string;
  identifierType: IdentifierType;
  endpoint: string;
  windowStart: Date;
  requestCount: number;
  windowSizeSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Rate Limit Status
// ============================================================

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfter: number | null; // seconds until retry is allowed
  burstRemaining?: number;
}

export interface RateLimitHeaders {
  "X-RateLimit-Limit": string;
  "X-RateLimit-Remaining": string;
  "X-RateLimit-Reset": string;
  "Retry-After"?: string;
}

// ============================================================
// Rate Limit Violation
// ============================================================

export interface RateLimitViolation {
  id: string;
  identifier: string;
  identifierType: IdentifierType;
  endpoint: string;
  configName: string | null;
  limitValue: number;
  currentCount: number;
  ipAddress: string | null;
  userAgent: string | null;
  headers: Record<string, string> | null;
  createdAt: Date;
}

// ============================================================
// IP Blocklist
// ============================================================

export interface BlocklistEntry {
  id: string;
  ipAddress: string;
  reason: string;
  violationCount: number;
  blockedAt: Date;
  expiresAt: Date | null;
  blockedBy: string | null;
  createdAt: Date;
}

// ============================================================
// Rate Limiter Options
// ============================================================

export interface RateLimiterOptions {
  /** Use database for persistence (default: false for in-memory) */
  useDatabase?: boolean;
  /** Default window size in seconds */
  defaultWindowSeconds?: number;
  /** Default max requests per window */
  defaultMaxRequests?: number;
  /** Enable violation logging */
  logViolations?: boolean;
  /** Enable auto-blocking for severe abuse */
  autoBlockEnabled?: boolean;
  /** Violation threshold before auto-block */
  autoBlockThreshold?: number;
  /** Auto-block duration in seconds */
  autoBlockDuration?: number;
}

// ============================================================
// Request Context
// ============================================================

export interface RequestContext {
  userId?: string;
  ipAddress: string;
  userAgent?: string;
  apiKey?: string;
  endpoint: string;
  method: string;
  tier?: UserTier;
  roles?: string[];
  headers?: Record<string, string>;
}

// ============================================================
// Algorithm Types
// ============================================================

export type RateLimitAlgorithm =
  | "fixed_window"
  | "sliding_window"
  | "token_bucket"
  | "leaky_bucket";

export interface TokenBucketState {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per second
}

export interface SlidingWindowState {
  requests: number[];
  windowMs: number;
}

// ============================================================
// Middleware Types
// ============================================================

export interface RateLimitMiddlewareConfig {
  /** Skip rate limiting for these paths */
  skipPaths?: string[];
  /** Custom key generator */
  keyGenerator?: (context: RequestContext) => string;
  /** Custom response handler */
  onRateLimited?: (status: RateLimitStatus) => void;
  /** Skip rate limiting based on context */
  skip?: (context: RequestContext) => boolean;
}

// ============================================================
// Response Types
// ============================================================

export interface RateLimitResponse {
  success: boolean;
  status: RateLimitStatus;
  headers: RateLimitHeaders;
}

export interface RateLimitError {
  code: string;
  message: string;
  retryAfter: number;
  limit: number;
  windowSeconds: number;
}
