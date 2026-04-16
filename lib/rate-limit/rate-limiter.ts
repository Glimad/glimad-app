/**
 * Rate Limiter Service
 * Implements sliding window and token bucket algorithms
 * Supports both in-memory and database-backed storage
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  RateLimitStatus,
  RateLimitHeaders,
  RateLimitRule,
  RateLimiterOptions,
  RequestContext,
  IdentifierType,
  SlidingWindowState,
  TokenBucketState,
} from "./types";

// ============================================================
// In-Memory Storage
// ============================================================

interface MemoryStore {
  slidingWindows: Map<string, SlidingWindowState>;
  tokenBuckets: Map<string, TokenBucketState>;
  blocklist: Set<string>;
}

const memoryStore: MemoryStore = {
  slidingWindows: new Map(),
  tokenBuckets: new Map(),
  blocklist: new Set(),
};

// ============================================================
// Default Configurations
// ============================================================

const DEFAULT_RULES: Record<string, RateLimitRule> = {
  // Auth endpoints
  "auth:login": { name: "auth_login", maxRequests: 5, windowSeconds: 60 },
  "auth:signup": { name: "auth_signup", maxRequests: 3, windowSeconds: 60 },
  "auth:reset": {
    name: "auth_password_reset",
    maxRequests: 3,
    windowSeconds: 300,
  },

  // AI endpoints (tier-based)
  "ai:generate:starter": {
    name: "ai_generate",
    maxRequests: 10,
    windowSeconds: 60,
    tier: "starter",
  },
  "ai:generate:growth": {
    name: "ai_generate_growth",
    maxRequests: 50,
    windowSeconds: 60,
    tier: "growth",
  },
  "ai:generate:scale": {
    name: "ai_generate_scale",
    maxRequests: 200,
    windowSeconds: 60,
    tier: "scale",
  },

  // Brain endpoints
  "brain:query:starter": {
    name: "brain_query",
    maxRequests: 20,
    windowSeconds: 60,
    tier: "starter",
  },
  "brain:query:growth": {
    name: "brain_query_growth",
    maxRequests: 100,
    windowSeconds: 60,
    tier: "growth",
  },
  "brain:query:scale": {
    name: "brain_query_scale",
    maxRequests: 500,
    windowSeconds: 60,
    tier: "scale",
  },

  // Mission endpoints
  "mission:start": {
    name: "mission_start",
    maxRequests: 10,
    windowSeconds: 60,
  },
  "mission:respond": {
    name: "mission_respond",
    maxRequests: 30,
    windowSeconds: 60,
  },

  // Scraping (strict)
  "scrape:request": {
    name: "scrape_request",
    maxRequests: 5,
    windowSeconds: 3600,
  },
  "scrape:run": { name: "scrape_run", maxRequests: 2, windowSeconds: 3600 },

  // General API
  "api:general:starter": {
    name: "api_general",
    maxRequests: 100,
    windowSeconds: 60,
    tier: "starter",
  },
  "api:general:growth": {
    name: "api_general_growth",
    maxRequests: 500,
    windowSeconds: 60,
    tier: "growth",
  },
  "api:general:scale": {
    name: "api_general_scale",
    maxRequests: 2000,
    windowSeconds: 60,
    tier: "scale",
  },

  // Payments
  "stripe:checkout": {
    name: "stripe_checkout",
    maxRequests: 5,
    windowSeconds: 60,
  },
};

// ============================================================
// Rate Limiter Class
// ============================================================

export class RateLimiter {
  private options: Required<RateLimiterOptions>;
  private supabase: SupabaseClient | null = null;

  constructor(options: RateLimiterOptions = {}) {
    this.options = {
      useDatabase: options.useDatabase ?? false,
      defaultWindowSeconds: options.defaultWindowSeconds ?? 60,
      defaultMaxRequests: options.defaultMaxRequests ?? 100,
      logViolations: options.logViolations ?? true,
      autoBlockEnabled: options.autoBlockEnabled ?? true,
      autoBlockThreshold: options.autoBlockThreshold ?? 100,
      autoBlockDuration: options.autoBlockDuration ?? 86400, // 24 hours
    };

    if (this.options.useDatabase) {
      this.initSupabase();
    }
  }

  private initSupabase(): void {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key) {
      this.supabase = createClient(url, key, {
        auth: { persistSession: false },
      });
    }
  }

  // ============================================================
  // Main Rate Limit Check
  // ============================================================

  /**
   * Check rate limit for a request
   */
  async checkLimit(
    context: RequestContext,
    rule?: RateLimitRule,
  ): Promise<RateLimitStatus> {
    const identifier = this.getIdentifier(context);
    const identifierType = this.getIdentifierType(context);

    // Check blocklist first
    if (await this.isBlocked(context.ipAddress)) {
      return {
        allowed: false,
        remaining: 0,
        limit: 0,
        resetAt: new Date(Date.now() + 86400000), // 24 hours
        retryAfter: 86400,
      };
    }

    // Get applicable rule
    const effectiveRule = rule || this.getRule(context);
    const { maxRequests, windowSeconds } = effectiveRule;

    // Check limit using sliding window
    const status = this.options.useDatabase
      ? await this.checkLimitDatabase(
          identifier,
          identifierType,
          context.endpoint,
          maxRequests,
          windowSeconds,
        )
      : this.checkLimitMemory(
          identifier,
          context.endpoint,
          maxRequests,
          windowSeconds,
        );

    // Log violation if not allowed
    if (!status.allowed && this.options.logViolations) {
      await this.logViolation(context, effectiveRule, status);
    }

    return status;
  }

  /**
   * Consume a rate limit token (for pre-flight checks)
   */
  async consume(
    context: RequestContext,
    rule?: RateLimitRule,
  ): Promise<RateLimitStatus> {
    const status = await this.checkLimit(context, rule);

    if (status.allowed) {
      const identifier = this.getIdentifier(context);

      if (this.options.useDatabase) {
        await this.incrementDatabase(
          identifier,
          this.getIdentifierType(context),
          context.endpoint,
          (rule || this.getRule(context)).windowSeconds,
        );
      }
      // In-memory already incremented during check
    }

    return status;
  }

  // ============================================================
  // In-Memory Implementation
  // ============================================================

  private checkLimitMemory(
    identifier: string,
    endpoint: string,
    maxRequests: number,
    windowSeconds: number,
  ): RateLimitStatus {
    const key = `${identifier}:${endpoint}`;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    // Get or create sliding window state
    let state = memoryStore.slidingWindows.get(key);
    if (!state) {
      state = { requests: [], windowMs };
      memoryStore.slidingWindows.set(key, state);
    }

    // Remove expired timestamps
    state.requests = state.requests.filter((ts) => now - ts < windowMs);

    // Check if limit exceeded
    const currentCount = state.requests.length;
    const allowed = currentCount < maxRequests;

    if (allowed) {
      // Add current request timestamp
      state.requests.push(now);
    }

    // Calculate reset time
    const oldestRequest = state.requests[0] || now;
    const resetAt = new Date(oldestRequest + windowMs);

    return {
      allowed,
      remaining: Math.max(0, maxRequests - state.requests.length),
      limit: maxRequests,
      resetAt,
      retryAfter: allowed ? null : Math.ceil((resetAt.getTime() - now) / 1000),
    };
  }

  // ============================================================
  // Database Implementation
  // ============================================================

  private async checkLimitDatabase(
    identifier: string,
    identifierType: IdentifierType,
    endpoint: string,
    maxRequests: number,
    windowSeconds: number,
  ): Promise<RateLimitStatus> {
    if (!this.supabase) {
      // Fallback to memory
      return this.checkLimitMemory(
        identifier,
        endpoint,
        maxRequests,
        windowSeconds,
      );
    }

    // Get current status from database
    const { data, error } = await this.supabase.rpc("get_rate_limit_status", {
      p_identifier: identifier,
      p_identifier_type: identifierType,
      p_endpoint: endpoint,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.error("Rate limit check failed:", error);
      // Allow on error to prevent blocking legitimate traffic
      return {
        allowed: true,
        remaining: maxRequests,
        limit: maxRequests,
        resetAt: new Date(Date.now() + windowSeconds * 1000),
        retryAfter: null,
      };
    }

    const row = data?.[0];
    const currentCount = row?.current_count || 0;
    const allowed = currentCount < maxRequests;
    const resetAt = row?.window_end
      ? new Date(row.window_end)
      : new Date(Date.now() + windowSeconds * 1000);

    return {
      allowed,
      remaining: Math.max(0, maxRequests - currentCount - 1), // -1 for current request
      limit: maxRequests,
      resetAt,
      retryAfter: allowed
        ? null
        : Math.ceil((resetAt.getTime() - Date.now()) / 1000),
    };
  }

  private async incrementDatabase(
    identifier: string,
    identifierType: IdentifierType,
    endpoint: string,
    windowSeconds: number,
  ): Promise<void> {
    if (!this.supabase) return;

    await this.supabase.rpc("increment_rate_limit", {
      p_identifier: identifier,
      p_identifier_type: identifierType,
      p_endpoint: endpoint,
      p_window_seconds: windowSeconds,
    });
  }

  // ============================================================
  // Token Bucket Algorithm
  // ============================================================

  /**
   * Check rate limit using token bucket algorithm
   * Better for burst handling
   */
  checkTokenBucket(
    identifier: string,
    endpoint: string,
    maxTokens: number,
    refillRate: number, // tokens per second
  ): RateLimitStatus {
    const key = `bucket:${identifier}:${endpoint}`;
    const now = Date.now();

    let state = memoryStore.tokenBuckets.get(key);
    if (!state) {
      state = {
        tokens: maxTokens,
        lastRefill: now,
        maxTokens,
        refillRate,
      };
      memoryStore.tokenBuckets.set(key, state);
    }

    // Refill tokens based on time elapsed
    const elapsed = (now - state.lastRefill) / 1000;
    const tokensToAdd = elapsed * refillRate;
    state.tokens = Math.min(maxTokens, state.tokens + tokensToAdd);
    state.lastRefill = now;

    // Check if we have tokens
    const allowed = state.tokens >= 1;

    if (allowed) {
      state.tokens -= 1;
    }

    // Calculate time until next token
    const timeToNextToken = allowed ? 0 : (1 - state.tokens) / refillRate;
    const resetAt = new Date(now + timeToNextToken * 1000);

    return {
      allowed,
      remaining: Math.floor(state.tokens),
      limit: maxTokens,
      resetAt,
      retryAfter: allowed ? null : Math.ceil(timeToNextToken),
      burstRemaining: Math.floor(state.tokens),
    };
  }

  // ============================================================
  // Blocklist Management
  // ============================================================

  async isBlocked(ipAddress: string): Promise<boolean> {
    // Check memory first
    if (memoryStore.blocklist.has(ipAddress)) {
      return true;
    }

    // Check database if enabled
    if (this.supabase) {
      const { data, error } = await this.supabase.rpc("is_ip_blocked", {
        p_ip_address: ipAddress,
      });

      if (!error && data === true) {
        memoryStore.blocklist.add(ipAddress);
        return true;
      }
    }

    return false;
  }

  async blockIP(
    ipAddress: string,
    reason: string,
    durationSeconds?: number,
  ): Promise<void> {
    memoryStore.blocklist.add(ipAddress);

    if (this.supabase) {
      const expiresAt = durationSeconds
        ? new Date(Date.now() + durationSeconds * 1000).toISOString()
        : null;

      await this.supabase.from("rate_limit_blocklist").upsert({
        ip_address: ipAddress,
        reason,
        expires_at: expiresAt,
        blocked_by: "manual",
      });
    }
  }

  async unblockIP(ipAddress: string): Promise<void> {
    memoryStore.blocklist.delete(ipAddress);

    if (this.supabase) {
      await this.supabase
        .from("rate_limit_blocklist")
        .delete()
        .eq("ip_address", ipAddress);
    }
  }

  // ============================================================
  // Violation Logging
  // ============================================================

  private async logViolation(
    context: RequestContext,
    rule: RateLimitRule,
    status: RateLimitStatus,
  ): Promise<void> {
    if (!this.supabase) return;

    try {
      await this.supabase.rpc("log_rate_violation", {
        p_identifier: this.getIdentifier(context),
        p_identifier_type: this.getIdentifierType(context),
        p_endpoint: context.endpoint,
        p_config_name: rule.name,
        p_limit_value: status.limit,
        p_current_count: status.limit - status.remaining,
        p_ip_address: context.ipAddress,
        p_user_agent: context.userAgent,
        p_headers: context.headers ? JSON.stringify(context.headers) : null,
      });

      // Check for auto-block
      if (this.options.autoBlockEnabled) {
        await this.supabase.rpc("auto_block_ip", {
          p_ip_address: context.ipAddress,
          p_threshold: this.options.autoBlockThreshold,
          p_time_window: "1 hour",
          p_block_duration: `${this.options.autoBlockDuration} seconds`,
        });
      }
    } catch (error) {
      console.error("Failed to log rate limit violation:", error);
    }
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  private getIdentifier(context: RequestContext): string {
    // Prefer user ID, then API key, then IP
    if (context.userId) return context.userId;
    if (context.apiKey) return context.apiKey;
    return context.ipAddress;
  }

  private getIdentifierType(context: RequestContext): IdentifierType {
    if (context.userId) return "user_id";
    if (context.apiKey) return "api_key";
    return "ip";
  }

  private getRule(context: RequestContext): RateLimitRule {
    const tier = context.tier || "starter";
    const endpoint = context.endpoint.toLowerCase();

    // Match specific rules first
    if (
      endpoint.includes("/auth/login") ||
      endpoint.includes("/auth/callback")
    ) {
      return DEFAULT_RULES["auth:login"];
    }
    if (endpoint.includes("/auth/signup")) {
      return DEFAULT_RULES["auth:signup"];
    }
    if (endpoint.includes("/auth/reset")) {
      return DEFAULT_RULES["auth:reset"];
    }
    if (endpoint.includes("/studio/generate")) {
      return (
        DEFAULT_RULES[`ai:generate:${tier}`] ||
        DEFAULT_RULES["ai:generate:starter"]
      );
    }
    if (endpoint.includes("/brain")) {
      return (
        DEFAULT_RULES[`brain:query:${tier}`] ||
        DEFAULT_RULES["brain:query:starter"]
      );
    }
    if (endpoint.includes("/missions/start")) {
      return DEFAULT_RULES["mission:start"];
    }
    if (endpoint.includes("/missions") && endpoint.includes("/respond")) {
      return DEFAULT_RULES["mission:respond"];
    }
    if (endpoint.includes("/scrape/request")) {
      return DEFAULT_RULES["scrape:request"];
    }
    if (endpoint.includes("/scrape/run")) {
      return DEFAULT_RULES["scrape:run"];
    }
    if (endpoint.includes("/stripe/checkout")) {
      return DEFAULT_RULES["stripe:checkout"];
    }

    // Default rule based on tier
    return (
      DEFAULT_RULES[`api:general:${tier}`] ||
      DEFAULT_RULES["api:general:starter"]
    );
  }

  /**
   * Generate rate limit headers for response
   */
  getHeaders(status: RateLimitStatus): RateLimitHeaders {
    const headers: RateLimitHeaders = {
      "X-RateLimit-Limit": String(status.limit),
      "X-RateLimit-Remaining": String(status.remaining),
      "X-RateLimit-Reset": String(Math.floor(status.resetAt.getTime() / 1000)),
    };

    if (status.retryAfter !== null) {
      headers["Retry-After"] = String(status.retryAfter);
    }

    return headers;
  }

  /**
   * Get a specific rule by name
   */
  getRule_byName(name: string): RateLimitRule | undefined {
    return DEFAULT_RULES[name];
  }

  /**
   * Reset rate limit for an identifier
   */
  resetLimit(identifier: string, endpoint?: string): void {
    if (endpoint) {
      memoryStore.slidingWindows.delete(`${identifier}:${endpoint}`);
      memoryStore.tokenBuckets.delete(`bucket:${identifier}:${endpoint}`);
    } else {
      // Reset all for this identifier
      Array.from(memoryStore.slidingWindows.keys()).forEach((key) => {
        if (key.startsWith(`${identifier}:`)) {
          memoryStore.slidingWindows.delete(key);
        }
      });
      Array.from(memoryStore.tokenBuckets.keys()).forEach((key) => {
        if (key.startsWith(`bucket:${identifier}:`)) {
          memoryStore.tokenBuckets.delete(key);
        }
      });
    }
  }

  /**
   * Clear all in-memory state (for testing)
   */
  clearAll(): void {
    memoryStore.slidingWindows.clear();
    memoryStore.tokenBuckets.clear();
    memoryStore.blocklist.clear();
  }
}

// ============================================================
// Singleton Instance
// ============================================================

let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(options?: RateLimiterOptions): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter(options);
  }
  return rateLimiterInstance;
}

// ============================================================
// Convenience Functions
// ============================================================

/**
 * Quick rate limit check for an endpoint
 */
export async function checkRateLimit(
  context: RequestContext,
  rule?: RateLimitRule,
): Promise<RateLimitStatus> {
  return getRateLimiter().checkLimit(context, rule);
}

/**
 * Get rate limit headers for a status
 */
export function getRateLimitHeaders(status: RateLimitStatus): RateLimitHeaders {
  return getRateLimiter().getHeaders(status);
}
