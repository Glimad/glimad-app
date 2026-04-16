/**
 * Event Type Definitions
 * Complete type safety for all system events
 * Used for validation, logging, and telemetry
 */

// ============================================================
// Event Categories
// ============================================================

export type EventCategory =
  | "user"
  | "payment"
  | "mission"
  | "brain"
  | "content"
  | "system"
  | "auth"
  | "error"
  | "engagement";

export type EventSeverity = "info" | "warning" | "error" | "critical";

export type EventSource =
  | "api"
  | "edge_function"
  | "n8n"
  | "webhook"
  | "internal";

// ============================================================
// Base Event Structure
// ============================================================

export interface EventContext {
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  projectId?: string;
  ipAddress?: string;
  userAgent?: string;
  httpMethod?: string;
  httpPath?: string;
  httpStatusCode?: number;
  source: EventSource;
  timestamp?: Date;
}

export interface BaseEvent {
  eventType: string;
  category: EventCategory;
  severity: EventSeverity;
  tags?: string[];
  context?: EventContext;
}

// ============================================================
// User Events
// ============================================================

export interface UserSignUpEvent extends BaseEvent {
  eventType: "user_signup";
  category: "user";
  payload: {
    email: string;
    name: string;
    source: "email" | "google" | "facebook" | "twitter";
  };
}

export interface UserLoginEvent extends BaseEvent {
  eventType: "user_login";
  category: "auth";
  payload: {
    email: string;
    method: "magic_link" | "password" | "oauth";
  };
}

export interface UserLogoutEvent extends BaseEvent {
  eventType: "user_logout";
  category: "auth";
  payload: {
    userId: string;
    reason?: "user_initiated" | "session_expired" | "security";
  };
}

// ============================================================
// Payment Events
// ============================================================

export interface StripeCheckoutCreatedEvent extends BaseEvent {
  eventType: "stripe_checkout_created";
  category: "payment";
  payload: {
    sessionId: string;
    amountEur: number;
    plan: "BASE" | "PRO" | "ELITE";
    currency: string;
  };
}

export interface StripePaymentCompletedEvent extends BaseEvent {
  eventType: "stripe_payment_completed";
  category: "payment";
  payload: {
    chargeId: string;
    amountEur: number;
    plan: "BASE" | "PRO" | "ELITE";
    creditsAwarded: number;
  };
}

export interface StripePaymentFailedEvent extends BaseEvent {
  eventType: "stripe_payment_failed";
  category: "payment";
  payload: {
    chargeId: string;
    errorCode: string;
    errorMessage: string;
    attemptCount: number;
  };
}

// ============================================================
// Mission Events
// ============================================================

export interface MissionStartedEvent extends BaseEvent {
  eventType: "mission_started";
  category: "mission";
  payload: {
    missionId: string;
    missionType: string;
    missionName: string;
  };
}

export interface MissionCompletedEvent extends BaseEvent {
  eventType: "mission_completed";
  category: "mission";
  payload: {
    missionId: string;
    missionType: string;
    durationMinutes: number;
    creditsEarned: number;
    qualityScore?: number;
  };
}

export interface MissionAbandonedEvent extends BaseEvent {
  eventType: "mission_abandoned";
  category: "mission";
  payload: {
    missionId: string;
    missionType: string;
    reason: "user_cancel" | "timeout" | "error" | "insufficient_credits";
    completionPercentage: number;
  };
}

// ============================================================
// Brain Events
// ============================================================

export interface BrainUpdateStartedEvent extends BaseEvent {
  eventType: "brain_update_started";
  category: "brain";
  payload: {
    userId: string;
    projectId: string;
    trigger: "manual" | "scheduled" | "webhook" | "mission_completion";
    inputDataSize: number;
  };
}

export interface BrainUpdateCompletedEvent extends BaseEvent {
  eventType: "brain_update_completed";
  category: "brain";
  payload: {
    userId: string;
    phase: string;
    signalsCount: number;
    executionTimeMs: number;
    tokensUsed: number;
    success: boolean;
  };
}

export interface BrainFactsAddedEvent extends BaseEvent {
  eventType: "brain_facts_added";
  category: "brain";
  payload: {
    factsCount: number;
    source: "user_input" | "scraper" | "webhook" | "api";
    dataSize: number;
  };
}

// ============================================================
// Content Events
// ============================================================

export interface ContentPublishedEvent extends BaseEvent {
  eventType: "content_published";
  category: "content";
  payload: {
    contentId: string;
    contentType: string;
    medium: "instagram" | "tiktok" | "youtube" | "twitter" | "email";
    url?: string;
  };
}

export interface ContentScrapedEvent extends BaseEvent {
  eventType: "content_scraped";
  category: "engagement";
  payload: {
    url: string;
    domain: string;
    postsCount: number;
    dataSize: number;
    executionTimeMs: number;
  };
}

// ============================================================
// System Events
// ============================================================

export interface SystemHealthCheckEvent extends BaseEvent {
  eventType: "system_health_check";
  category: "system";
  payload: {
    database: "healthy" | "degraded" | "down";
    api: "healthy" | "degraded" | "down";
    n8n: "healthy" | "degraded" | "down";
    cache: "healthy" | "degraded" | "down";
    externalServices: {
      openai: "healthy" | "degraded" | "down";
      stripe: "healthy" | "degraded" | "down";
      [key: string]: "healthy" | "degraded" | "down";
    };
  };
}

export interface ErrorOccurredEvent extends BaseEvent {
  eventType: "error_occurred";
  category: "error";
  payload: {
    errorCode: string;
    errorMessage: string;
    stackTrace?: string;
    severity: "low" | "medium" | "high" | "critical";
    context?: Record<string, unknown>;
  };
}

export interface RateLimitExceededEvent extends BaseEvent {
  eventType: "rate_limit_exceeded";
  category: "error";
  payload: {
    userId: string;
    endpoint: string;
    limit: number;
    currentUsage: number;
    resetAfterSeconds: number;
    planType: "BASE" | "PRO" | "ELITE" | "FREE";
  };
}

// ============================================================
// Engagement Events
// ============================================================

export interface FeatureAccessedEvent extends BaseEvent {
  eventType: "feature_accessed";
  category: "engagement";
  payload: {
    featureName: string;
    featureCategory: string;
    accessMethod: "direct" | "navigation" | "search" | "recommendation";
  };
}

export interface ButtonClickedEvent extends BaseEvent {
  eventType: "button_clicked";
  category: "engagement";
  payload: {
    buttonName: string;
    buttonId?: string;
    page: string;
    section: string;
    actionTriggered?: string;
  };
}

// ============================================================
// Event Union Type
// ============================================================

export type SystemEvent =
  | UserSignUpEvent
  | UserLoginEvent
  | UserLogoutEvent
  | StripeCheckoutCreatedEvent
  | StripePaymentCompletedEvent
  | StripePaymentFailedEvent
  | MissionStartedEvent
  | MissionCompletedEvent
  | MissionAbandonedEvent
  | BrainUpdateStartedEvent
  | BrainUpdateCompletedEvent
  | BrainFactsAddedEvent
  | ContentPublishedEvent
  | ContentScrapedEvent
  | SystemHealthCheckEvent
  | ErrorOccurredEvent
  | RateLimitExceededEvent
  | FeatureAccessedEvent
  | ButtonClickedEvent;

// ============================================================
// Event Definition Metadata
// ============================================================

export interface EventDefinition {
  eventType: string;
  category: EventCategory;
  displayName: string;
  description: string;
  schema: Record<string, unknown>;
  piiFields: string[];
  retentionDays: number;
  samplingRate: number;
  enabled: boolean;
}

// ============================================================
// Event Log Entry (Database)
// ============================================================

export interface EventLogEntry {
  eventId: string;
  eventType: string;
  userId?: string;
  projectId?: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  payload: Record<string, unknown>;
  payloadMasked: Record<string, unknown>;
  httpMethod?: string;
  httpPath?: string;
  httpStatusCode?: number;
  source: EventSource;
  ipAddress?: string;
  userAgent?: string;
  severity: EventSeverity;
  tags: string[];
  createdAt: Date;
}

// ============================================================
// Type Guards
// ============================================================

export function isSystemEvent(event: unknown): event is SystemEvent {
  return (
    event !== null &&
    event !== undefined &&
    typeof event === "object" &&
    "eventType" in event &&
    "category" in event &&
    "severity" in event &&
    "payload" in event
  );
}

export function getUserSignupEvent(
  event: SystemEvent,
): event is UserSignUpEvent {
  return event.eventType === "user_signup";
}

export function getPaymentEvent(
  event: SystemEvent,
): event is
  | StripeCheckoutCreatedEvent
  | StripePaymentCompletedEvent
  | StripePaymentFailedEvent {
  return event.category === "payment";
}

export function getMissionEvent(
  event: SystemEvent,
): event is
  | MissionStartedEvent
  | MissionCompletedEvent
  | MissionAbandonedEvent {
  return event.category === "mission";
}

export function getBrainEvent(
  event: SystemEvent,
): event is
  | BrainUpdateStartedEvent
  | BrainUpdateCompletedEvent
  | BrainFactsAddedEvent {
  return event.category === "brain";
}

export function getErrorEvent(
  event: SystemEvent,
): event is ErrorOccurredEvent | RateLimitExceededEvent {
  return event.category === "error";
}

// ============================================================
// Event Validation Schema
// ============================================================

export const eventValidationSchemas: Record<string, Record<string, unknown>> = {
  user_signup: {
    email: { type: "string", format: "email" },
    name: { type: "string", minLength: 2 },
    source: {
      type: "string",
      enum: ["email", "google", "facebook", "twitter"],
    },
  },
  user_login: {
    email: { type: "string", format: "email" },
    method: { type: "string", enum: ["magic_link", "password", "oauth"] },
  },
  mission_completed: {
    missionId: { type: "string", format: "uuid" },
    missionType: { type: "string" },
    durationMinutes: { type: "number", minimum: 0 },
    creditsEarned: { type: "number", minimum: 0 },
  },
  brain_update_completed: {
    userId: { type: "string", format: "uuid" },
    phase: { type: "string" },
    signalsCount: { type: "number", minimum: 0 },
    executionTimeMs: { type: "number", minimum: 0 },
    success: { type: "boolean" },
  },
};
