/**
 * Circuit Breaker Implementation
 * Prevents cascading failures by tracking error rates and temporarily blocking calls
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Too many failures, requests are blocked
 * - HALF_OPEN: Testing if service has recovered
 */

import { AppError } from "./app-error";
import { ErrorCode } from "./error-codes";

// ============================================================
// Types
// ============================================================

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /** Name/identifier for this circuit breaker */
  name: string;
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms to wait before attempting recovery */
  resetTimeout: number;
  /** Number of successful calls in HALF_OPEN to close circuit */
  successThreshold: number;
  /** Time window in ms to count failures */
  failureCountWindow: number;
  /** Error codes that should trigger the circuit */
  triggerOnCodes?: ErrorCode[];
  /** Whether to log state transitions */
  enableLogging?: boolean;
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  lastStateChange: Date;
  totalRequests: number;
  failedRequests: number;
  blockedRequests: number;
}

interface FailureRecord {
  timestamp: Date;
  errorCode?: string;
}

// ============================================================
// Circuit Breaker Class
// ============================================================

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures: FailureRecord[] = [];
  private successes: number = 0;
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;
  private lastStateChange: Date = new Date();
  private totalRequests: number = 0;
  private failedRequests: number = 0;
  private blockedRequests: number = 0;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      triggerOnCodes: [],
      enableLogging: true,
      ...config,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit is open
    if (this.state === "OPEN") {
      this.blockedRequests++;
      this.log(`Circuit ${this.config.name} is OPEN, blocking request`);
      throw new AppError("GLM_SYS_907", {
        metadata: {
          circuitName: this.config.name,
          blockedRequests: this.blockedRequests,
        },
      });
    }

    // For HALF_OPEN, only allow limited requests through
    if (this.state === "HALF_OPEN") {
      this.log(
        `Circuit ${this.config.name} is HALF_OPEN, testing with request`,
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Execute with fallback if circuit is open
   */
  async executeWithFallback<T>(
    fn: () => Promise<T>,
    fallback: () => Promise<T> | T,
  ): Promise<T> {
    try {
      return await this.execute(fn);
    } catch (error) {
      if (error instanceof AppError && error.code === "GLM_SYS_907") {
        this.log(`Circuit ${this.config.name} using fallback`);
        return await fallback();
      }
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.lastSuccessTime = new Date();
    this.successes++;

    if (this.state === "HALF_OPEN") {
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo("CLOSED");
        this.reset();
      }
    } else if (this.state === "CLOSED") {
      // Clean up old failure records
      this.cleanupOldFailures();
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: unknown): void {
    this.lastFailureTime = new Date();
    this.failedRequests++;

    // Check if this error should trigger the circuit
    if (!this.shouldTrigger(error)) {
      return;
    }

    // Record the failure
    const errorCode = error instanceof AppError ? error.code : undefined;
    this.failures.push({
      timestamp: new Date(),
      errorCode,
    });

    // Clean up old failures outside the window
    this.cleanupOldFailures();

    if (this.state === "HALF_OPEN") {
      // Any failure in HALF_OPEN reopens the circuit
      this.transitionTo("OPEN");
      this.scheduleReset();
    } else if (this.state === "CLOSED") {
      // Check if we've exceeded the threshold
      if (this.failures.length >= this.config.failureThreshold) {
        this.transitionTo("OPEN");
        this.scheduleReset();
      }
    }
  }

  /**
   * Check if error should trigger circuit
   */
  private shouldTrigger(error: unknown): boolean {
    // If no specific codes configured, trigger on any error
    if (this.config.triggerOnCodes.length === 0) {
      return true;
    }

    // Check if error matches configured codes
    if (error instanceof AppError) {
      return this.config.triggerOnCodes.includes(error.code);
    }

    return true;
  }

  /**
   * Clean up failures outside the time window
   */
  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.config.failureCountWindow;
    this.failures = this.failures.filter((f) => f.timestamp.getTime() > cutoff);
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = new Date();
    this.log(
      `Circuit ${this.config.name} transitioned from ${oldState} to ${newState}`,
    );
  }

  /**
   * Schedule reset timer for OPEN state
   */
  private scheduleReset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      this.transitionTo("HALF_OPEN");
      this.successes = 0;
    }, this.config.resetTimeout);
  }

  /**
   * Reset circuit breaker to initial state
   */
  private reset(): void {
    this.failures = [];
    this.successes = 0;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  /**
   * Force circuit to specific state (for testing/admin)
   */
  forceState(state: CircuitState): void {
    this.transitionTo(state);
    if (state === "CLOSED") {
      this.reset();
    } else if (state === "OPEN") {
      this.scheduleReset();
    }
  }

  /**
   * Get current statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      name: this.config.name,
      state: this.state,
      failures: this.failures.length,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      lastStateChange: this.lastStateChange,
      totalRequests: this.totalRequests,
      failedRequests: this.failedRequests,
      blockedRequests: this.blockedRequests,
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit is allowing requests
   */
  isAllowingRequests(): boolean {
    return this.state !== "OPEN";
  }

  /**
   * Log message if logging enabled
   */
  private log(message: string): void {
    if (this.config.enableLogging) {
      console.log(`[CircuitBreaker] ${message}`);
    }
  }
}

// ============================================================
// Circuit Breaker Registry
// ============================================================

class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker
   */
  getOrCreate(config: CircuitBreakerConfig): CircuitBreaker {
    const existing = this.breakers.get(config.name);
    if (existing) {
      return existing;
    }

    const breaker = new CircuitBreaker(config);
    this.breakers.set(config.name, breaker);
    return breaker;
  }

  /**
   * Get existing circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breakers
   */
  getAll(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  /**
   * Get statistics for all circuit breakers
   */
  getAllStats(): CircuitBreakerStats[] {
    return this.getAll().map((b) => b.getStats());
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach((breaker) => breaker.forceState("CLOSED"));
  }

  /**
   * Remove a circuit breaker
   */
  remove(name: string): boolean {
    return this.breakers.delete(name);
  }

  /**
   * Clear all circuit breakers
   */
  clear(): void {
    this.breakers.clear();
  }
}

// Global registry instance
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

// ============================================================
// Pre-configured Circuit Breakers
// ============================================================

/**
 * Circuit breaker for Supabase/Database operations
 */
export const databaseCircuitBreaker = circuitBreakerRegistry.getOrCreate({
  name: "database",
  failureThreshold: 5,
  resetTimeout: 30000, // 30 seconds
  successThreshold: 3,
  failureCountWindow: 60000, // 1 minute
  triggerOnCodes: ["GLM_DATA_200", "GLM_DATA_201", "GLM_DATA_206"],
});

/**
 * Circuit breaker for Claude/AI operations
 */
export const claudeCircuitBreaker = circuitBreakerRegistry.getOrCreate({
  name: "claude",
  failureThreshold: 3,
  resetTimeout: 60000, // 1 minute
  successThreshold: 2,
  failureCountWindow: 120000, // 2 minutes
  triggerOnCodes: ["GLM_API_305", "GLM_API_306"],
});

/**
 * Circuit breaker for Stripe operations
 */
export const stripeCircuitBreaker = circuitBreakerRegistry.getOrCreate({
  name: "stripe",
  failureThreshold: 3,
  resetTimeout: 30000, // 30 seconds
  successThreshold: 2,
  failureCountWindow: 60000, // 1 minute
  triggerOnCodes: ["GLM_PAY_407"],
});

/**
 * Circuit breaker for social media scraping
 */
export const scrapeCircuitBreaker = circuitBreakerRegistry.getOrCreate({
  name: "scrape",
  failureThreshold: 5,
  resetTimeout: 120000, // 2 minutes
  successThreshold: 2,
  failureCountWindow: 300000, // 5 minutes
  triggerOnCodes: ["GLM_SCRAPE_703", "GLM_SCRAPE_704", "GLM_SCRAPE_705"],
});

// ============================================================
// Helper Functions
// ============================================================

/**
 * Create a circuit breaker for a specific service
 */
export function createCircuitBreaker(
  name: string,
  options?: Partial<CircuitBreakerConfig>,
): CircuitBreaker {
  return circuitBreakerRegistry.getOrCreate({
    name,
    failureThreshold: 5,
    resetTimeout: 30000,
    successThreshold: 3,
    failureCountWindow: 60000,
    ...options,
  });
}

/**
 * Decorator to wrap a function with circuit breaker
 */
export function withCircuitBreaker<TArgs extends unknown[], TReturn>(
  breaker: CircuitBreaker,
  fn: (...args: TArgs) => Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    return breaker.execute(() => fn(...args));
  };
}

/**
 * Decorator with fallback
 */
export function withCircuitBreakerFallback<TArgs extends unknown[], TReturn>(
  breaker: CircuitBreaker,
  fn: (...args: TArgs) => Promise<TReturn>,
  fallback: (...args: TArgs) => Promise<TReturn> | TReturn,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    return breaker.executeWithFallback(
      () => fn(...args),
      () => fallback(...args),
    );
  };
}
