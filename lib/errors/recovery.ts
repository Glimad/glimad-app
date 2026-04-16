/**
 * Error Recovery Strategies
 * Implements retry, degrade, queue, and escalate strategies
 */

import { AppError, ErrorContext } from "./app-error";
import { ErrorCode } from "./error-codes";

// ============================================================
// Types
// ============================================================

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
  /** Backoff multiplier (e.g., 2 for exponential) */
  backoffMultiplier: number;
  /** Add jitter to prevent thundering herd */
  jitter: boolean;
  /** Error codes that should trigger retry */
  retryOnCodes?: ErrorCode[];
  /** Callback before each retry */
  onRetry?: (attempt: number, error: AppError) => void;
}

export interface DegradeConfig {
  /** Fallback function to call when degrading */
  fallback: () => unknown;
  /** Whether to log when degrading */
  logDegradation: boolean;
  /** Metrics callback */
  onDegrade?: (error: AppError) => void;
}

export interface QueueConfig {
  /** Queue name */
  queueName: string;
  /** Maximum queue size */
  maxSize: number;
  /** Time to live in queue (ms) */
  ttl: number;
  /** Process function */
  processor: (item: QueueItem) => Promise<void>;
  /** Callback when item is queued */
  onQueued?: (item: QueueItem) => void;
  /** Callback when queue is full */
  onQueueFull?: (item: QueueItem) => void;
}

export interface QueueItem {
  id: string;
  fn: () => Promise<unknown>;
  args: unknown[];
  addedAt: Date;
  retryCount: number;
  lastError?: AppError;
  context?: ErrorContext;
}

export interface EscalateConfig {
  /** Notification channels */
  channels: ("email" | "slack" | "webhook")[];
  /** Recipients */
  recipients: string[];
  /** Webhook URL */
  webhookUrl?: string;
  /** Include stack trace */
  includeStackTrace: boolean;
  /** Callback after escalation */
  onEscalate?: (error: AppError) => void;
}

// ============================================================
// Retry Strategy
// ============================================================

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const fullConfig: RetryConfig = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    ...config,
  };

  let lastError: AppError | null = null;
  let attempt = 0;

  while (attempt <= fullConfig.maxRetries) {
    try {
      return await fn();
    } catch (error) {
      const appError = AppError.fromUnknown(error);
      lastError = appError;

      // Check if we should retry this error
      if (!shouldRetryError(appError, fullConfig)) {
        throw appError;
      }

      // Check if we've exhausted retries
      if (attempt >= fullConfig.maxRetries) {
        console.error(
          `[Recovery] Retry exhausted after ${attempt + 1} attempts:`,
          appError.code,
        );
        throw appError;
      }

      // Calculate delay with exponential backoff
      const delay = calculateDelay(attempt, fullConfig);

      // Log and callback
      console.warn(
        `[Recovery] Retry attempt ${attempt + 1}/${fullConfig.maxRetries} after ${delay}ms:`,
        appError.code,
      );

      if (fullConfig.onRetry) {
        fullConfig.onRetry(attempt + 1, appError);
      }

      // Wait before retry
      await sleep(delay);
      attempt++;
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError || new AppError("GLM_SYS_900");
}

/**
 * Check if error should trigger retry
 */
function shouldRetryError(error: AppError, config: RetryConfig): boolean {
  // If specific codes configured, check against them
  if (config.retryOnCodes && config.retryOnCodes.length > 0) {
    return config.retryOnCodes.includes(error.code);
  }

  // Otherwise, use the error's built-in retryable flag
  return error.retryable;
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  let delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
  delay = Math.min(delay, config.maxDelay);

  if (config.jitter) {
    // Add random jitter (±25%)
    const jitterRange = delay * 0.25;
    delay += Math.random() * jitterRange * 2 - jitterRange;
  }

  return Math.floor(delay);
}

// ============================================================
// Degrade Strategy
// ============================================================

/**
 * Execute with graceful degradation fallback
 */
export async function withDegrade<T>(
  fn: () => Promise<T>,
  fallback: () => T | Promise<T>,
  config: Partial<Omit<DegradeConfig, "fallback">> = {},
): Promise<T> {
  const fullConfig = {
    logDegradation: true,
    ...config,
  };

  try {
    return await fn();
  } catch (error) {
    const appError = AppError.fromUnknown(error);

    if (fullConfig.logDegradation) {
      console.warn(`[Recovery] Degrading due to error: ${appError.code}`);
    }

    if (fullConfig.onDegrade) {
      fullConfig.onDegrade(appError);
    }

    return await fallback();
  }
}

/**
 * Create a degradable function wrapper
 */
export function degradable<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  fallback: (...args: TArgs) => TReturn | Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    return withDegrade(
      () => fn(...args),
      () => fallback(...args),
    );
  };
}

// ============================================================
// Queue Strategy
// ============================================================

class RetryQueue {
  private items: QueueItem[] = [];
  private processing: boolean = false;
  private config: QueueConfig;

  constructor(config: QueueConfig) {
    this.config = config;
  }

  /**
   * Add item to queue
   */
  add(item: Omit<QueueItem, "id" | "addedAt" | "retryCount">): boolean {
    // Check queue size
    if (this.items.length >= this.config.maxSize) {
      console.warn(`[Queue] ${this.config.queueName} is full, rejecting item`);
      if (this.config.onQueueFull) {
        this.config.onQueueFull(item as QueueItem);
      }
      return false;
    }

    const queueItem: QueueItem = {
      ...item,
      id: crypto.randomUUID(),
      addedAt: new Date(),
      retryCount: 0,
    };

    this.items.push(queueItem);

    if (this.config.onQueued) {
      this.config.onQueued(queueItem);
    }

    console.log(
      `[Queue] Added item to ${this.config.queueName}: ${queueItem.id}`,
    );

    // Start processing if not already
    if (!this.processing) {
      this.process();
    }

    return true;
  }

  /**
   * Process queue items
   */
  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.items.length > 0) {
      const item = this.items[0];

      // Check TTL
      const age = Date.now() - item.addedAt.getTime();
      if (age > this.config.ttl) {
        console.warn(`[Queue] Item ${item.id} expired after ${age}ms`);
        this.items.shift();
        continue;
      }

      try {
        await this.config.processor(item);
        this.items.shift();
        console.log(`[Queue] Successfully processed item: ${item.id}`);
      } catch (error) {
        item.retryCount++;
        item.lastError = AppError.fromUnknown(error);

        if (item.retryCount >= 3) {
          console.error(
            `[Queue] Item ${item.id} failed after ${item.retryCount} attempts`,
          );
          this.items.shift();
        } else {
          // Move to end of queue for retry
          this.items.shift();
          this.items.push(item);
          // Wait before processing next
          await sleep(1000 * item.retryCount);
        }
      }
    }

    this.processing = false;
  }

  /**
   * Get queue stats
   */
  getStats(): { size: number; processing: boolean; oldestItem: Date | null } {
    return {
      size: this.items.length,
      processing: this.processing,
      oldestItem: this.items[0]?.addedAt || null,
    };
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.items = [];
  }
}

// Queue registry
const queues: Map<string, RetryQueue> = new Map();

/**
 * Get or create a queue
 */
export function getOrCreateQueue(config: QueueConfig): RetryQueue {
  const existing = queues.get(config.queueName);
  if (existing) return existing;

  const queue = new RetryQueue(config);
  queues.set(config.queueName, queue);
  return queue;
}

/**
 * Execute with queue fallback on failure
 */
export async function withQueue<T>(
  fn: () => Promise<T>,
  queueConfig: QueueConfig,
  context?: ErrorContext,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const appError = AppError.fromUnknown(error);

    // Only queue if error suggests queueing
    if (appError.recoveryStrategy === "queue") {
      const queue = getOrCreateQueue(queueConfig);
      queue.add({
        fn,
        args: [],
        context,
        lastError: appError,
      });
      console.log(
        `[Recovery] Queued operation for later retry: ${appError.code}`,
      );
    }

    throw appError;
  }
}

// ============================================================
// Escalate Strategy
// ============================================================

/**
 * Escalate error to ops team
 */
export async function escalate(
  error: AppError,
  config: Partial<EscalateConfig> = {},
): Promise<void> {
  const fullConfig: EscalateConfig = {
    channels: ["email"],
    recipients: [process.env.ADMIN_EMAIL || "admin@glimad.com"],
    includeStackTrace: true,
    ...config,
  };

  const payload = {
    code: error.code,
    message: error.message,
    severity: error.severity,
    timestamp: error.timestamp.toISOString(),
    context: error.context,
    userMessage: error.userMessage,
    internalDescription: error.internalDescription,
    stackTrace: fullConfig.includeStackTrace ? error.stack : undefined,
  };

  console.error(`[Escalation] Escalating error: ${error.code}`, payload);

  // Log escalation (actual notification implementation would go here)
  for (const channel of fullConfig.channels) {
    switch (channel) {
      case "email":
        console.log(
          `[Escalation] Would send email to: ${fullConfig.recipients.join(", ")}`,
        );
        // TODO: Implement email notification via Resend
        break;
      case "slack":
        console.log(`[Escalation] Would send Slack notification`);
        // TODO: Implement Slack webhook
        break;
      case "webhook":
        if (fullConfig.webhookUrl) {
          try {
            await fetch(fullConfig.webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          } catch (e) {
            console.error("[Escalation] Webhook failed:", e);
          }
        }
        break;
    }
  }

  if (fullConfig.onEscalate) {
    fullConfig.onEscalate(error);
  }
}

/**
 * Execute with escalation on critical errors
 */
export async function withEscalation<T>(
  fn: () => Promise<T>,
  config: Partial<EscalateConfig> = {},
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const appError = AppError.fromUnknown(error);

    // Escalate critical and high severity errors
    if (
      appError.severity === "critical" ||
      appError.recoveryStrategy === "escalate"
    ) {
      await escalate(appError, config);
    }

    throw appError;
  }
}

// ============================================================
// Combined Recovery Executor
// ============================================================

export interface RecoveryOptions {
  retry?: Partial<RetryConfig>;
  degrade?: { fallback: () => unknown };
  queue?: QueueConfig;
  escalate?: Partial<EscalateConfig>;
}

/**
 * Execute with automatic recovery based on error's recovery strategy
 */
export async function withRecovery<T>(
  fn: () => Promise<T>,
  options: RecoveryOptions = {},
  context?: ErrorContext,
): Promise<T> {
  try {
    // First try with retry
    return await withRetry(fn, options.retry);
  } catch (error) {
    const appError = AppError.fromUnknown(error);

    // Apply recovery strategy based on error definition
    switch (appError.recoveryStrategy) {
      case "retry":
        // Already tried retry above, escalate
        if (appError.severity === "critical" || appError.severity === "high") {
          await escalate(appError, options.escalate);
        }
        throw appError;

      case "degrade":
        if (options.degrade?.fallback) {
          console.warn(`[Recovery] Degrading for: ${appError.code}`);
          return options.degrade.fallback() as T;
        }
        throw appError;

      case "queue":
        if (options.queue) {
          const queue = getOrCreateQueue(options.queue);
          queue.add({
            fn,
            args: [],
            context,
            lastError: appError,
          });
          console.log(`[Recovery] Queued for later: ${appError.code}`);
        }
        throw appError;

      case "escalate":
        await escalate(appError, options.escalate);
        throw appError;

      case "ignore":
      default:
        throw appError;
    }
  }
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a retryable function wrapper
 */
export function retryable<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  config?: Partial<RetryConfig>,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    return withRetry(() => fn(...args), config);
  };
}

/**
 * Combine multiple recovery strategies
 */
export function recoverableOperation<T>(
  fn: () => Promise<T>,
  strategies: {
    retry?: Partial<RetryConfig>;
    fallback?: () => T | Promise<T>;
    escalateOn?: ("critical" | "high")[];
  },
): Promise<T> {
  return withRecovery(fn, {
    retry: strategies.retry,
    degrade: strategies.fallback
      ? { fallback: strategies.fallback }
      : undefined,
    escalate: strategies.escalateOn ? { channels: ["email"] } : undefined,
  });
}
