/**
 * Events Module - Complete Event Tracking System
 *
 * This module provides centralized event logging for all system actions
 * with automatic PII masking, correlation tracking, and database persistence.
 *
 * Usage:
 *
 * // Log an event
 * import { getEventLogger } from '@/lib/events';
 * import { MissionCompletedEvent } from '@/lib/events';
 *
 * const event: MissionCompletedEvent = {
 *   eventType: 'mission_completed',
 *   category: 'mission',
 *   severity: 'info',
 *   payload: { ... }
 * };
 *
 * await getEventLogger().logEvent(event, context);
 *
 * // In API routes
 * import { withEventTracking, logEventInHandler } from '@/lib/events';
 * import { SystemEvent } from '@/lib/events';
 *
 * export const POST = withEventTracking(async (req, context) => {
 *   // Handler automatically logs request/response
 *   // Errors are captured automatically
 * });
 */

// Core exports
export { EventLogger, getEventLogger, createEventLogger } from "./event-logger";

// Event types
export type {
  EventCategory,
  EventSeverity,
  EventSource,
  EventContext,
  BaseEvent,
  UserSignUpEvent,
  UserLoginEvent,
  UserLogoutEvent,
  StripeCheckoutCreatedEvent,
  StripePaymentCompletedEvent,
  StripePaymentFailedEvent,
  MissionStartedEvent,
  MissionCompletedEvent,
  MissionAbandonedEvent,
  BrainUpdateStartedEvent,
  BrainUpdateCompletedEvent,
  BrainFactsAddedEvent,
  ContentPublishedEvent,
  ContentScrapedEvent,
  SystemHealthCheckEvent,
  ErrorOccurredEvent,
  RateLimitExceededEvent,
  FeatureAccessedEvent,
  ButtonClickedEvent,
  SystemEvent,
  EventDefinition,
  EventLogEntry,
} from "./event-types";

export {
  isSystemEvent,
  getUserSignupEvent,
  getPaymentEvent,
  getMissionEvent,
  getBrainEvent,
  getErrorEvent,
  eventValidationSchemas,
} from "./event-types";

// Middleware exports
export {
  getCorrelationId,
  extractEventContext,
  eventTrackingMiddleware,
  withEventTracking,
  logEventInHandler,
  logRateLimitEvent,
  addContextHeaders,
  parseCorrelationId,
  createExpressEventMiddleware,
} from "./event-middleware";

// Documentation
export /* EVENT_CATALOG available at ./EVENT_CATALOG.md */ {};
