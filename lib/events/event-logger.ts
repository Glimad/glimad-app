/**
 * Event Logger Service
 * Centralized service for logging events with validation, PII masking, and database persistence
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  SystemEvent,
  EventContext,
  EventLogEntry,
  EventSeverity,
  eventValidationSchemas,
} from "./event-types";

// Validation rule interface for schema validation
interface ValidationRule {
  type?: string;
  enum?: string[];
  format?: string;
  minLength?: number;
  minimum?: number;
}

// Helper to generate UUID (native crypto)
function generateUUID(): string {
  return crypto.randomUUID();
}

// ============================================================
// Event Logger Class
// ============================================================

// Type for cached event data
interface CachedEventData {
  eventId: string;
  eventType: string;
  createdAt: string;
}

export class EventLogger {
  private supabaseUrl: string;
  private supabaseAnonKey: string;
  private piiMaskingRules: Map<string, string> = new Map();
  private eventCache: Map<string, CachedEventData[]> = new Map();

  constructor(supabaseUrl?: string, supabaseAnonKey?: string) {
    this.supabaseUrl =
      supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    this.supabaseAnonKey =
      supabaseAnonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      console.warn("EventLogger: Supabase credentials not configured");
    }

    this.initializePiiRules();
  }

  /**
   * Initialize PII masking rules
   */
  private initializePiiRules(): void {
    this.piiMaskingRules.set("email", "tokenize");
    this.piiMaskingRules.set("phone", "hide_partial");
    this.piiMaskingRules.set("password", "redact");
    this.piiMaskingRules.set("credit_card", "hide_partial");
    this.piiMaskingRules.set("ssn", "hide_partial");
    this.piiMaskingRules.set("full_name", "tokenize");
    this.piiMaskingRules.set("ip_address", "hide_partial");
    this.piiMaskingRules.set("user_id", "tokenize");
    this.piiMaskingRules.set("session_id", "redact");
    this.piiMaskingRules.set("auth_token", "redact");
  }

  /**
   * Mask PII in payload based on rules
   */
  private maskPii(
    payload: Record<string, unknown>,
    piiFields: string[] = [],
  ): Record<string, unknown> {
    const masked = JSON.parse(JSON.stringify(payload)) as Record<
      string,
      unknown
    >;

    for (const field of piiFields) {
      if (field in masked) {
        const strategy = this.piiMaskingRules.get(field) || "redact";
        masked[field] = this.applyMaskingStrategy(masked[field], strategy);
      }
    }

    return masked;
  }

  /**
   * Apply masking strategy to value
   */
  private applyMaskingStrategy(value: unknown, strategy: string): string {
    if (!value) return "[REDACTED]";

    const stringValue = String(value);

    switch (strategy) {
      case "redact":
        return "[REDACTED]";

      case "hash":
        return `[HASH:${this.simpleHash(stringValue)}]`;

      case "tokenize":
        const hash = this.simpleHash(stringValue);
        return `[TOKEN:${hash.substring(0, 8)}]`;

      case "hide_partial":
        if (stringValue.length <= 4) return "*".repeat(stringValue.length);
        const visible = Math.ceil(stringValue.length / 4);
        return (
          stringValue.substring(0, visible) +
          "*".repeat(stringValue.length - visible)
        );

      case "remove":
        return "";

      default:
        return "[REDACTED]";
    }
  }

  /**
   * Simple hash function for consistent tokenization
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const CharCode = str.charCodeAt(i);
      hash = (hash << 5) - hash + CharCode;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Validate event payload against schema
   */
  private validateEventPayload(
    eventType: string,
    payload: Record<string, unknown>,
  ): boolean {
    const schema = eventValidationSchemas[eventType];
    if (!schema) {
      // No schema defined, skip validation
      return true;
    }

    for (const [field, rules] of Object.entries(schema)) {
      if (field in payload) {
        const value = payload[field];
        const rule = rules as ValidationRule;

        // Type check
        if (rule.type && typeof value !== rule.type) {
          console.warn(
            `EventLogger: Invalid type for ${field}. Expected ${rule.type}, got ${typeof value}`,
          );
          return false;
        }

        // Enum check
        if (rule.enum && Array.isArray(rule.enum)) {
          const stringValue = String(value);
          if (!rule.enum.includes(stringValue)) {
            console.warn(
              `EventLogger: Invalid value for ${field}. Expected one of ${rule.enum.join(", ")}, got ${stringValue}`,
            );
            return false;
          }
        }

        // Format check (basic email validation)
        if (
          rule.format === "email" &&
          typeof value === "string" &&
          !this.isValidEmail(value)
        ) {
          console.warn(`EventLogger: Invalid email format for ${field}`);
          return false;
        }

        // Min length
        if (
          typeof rule.minLength === "number" &&
          String(value).length < rule.minLength
        ) {
          console.warn(
            `EventLogger: ${field} too short. Min length: ${rule.minLength}`,
          );
          return false;
        }

        // Min value
        if (typeof rule.minimum === "number" && Number(value) < rule.minimum) {
          console.warn(
            `EventLogger: ${field} below minimum. Min: ${rule.minimum}`,
          );
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Simple email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Get Supabase client (instance or service role)
   */
  private getSupabaseClient(useServiceRole: boolean = false): SupabaseClient {
    try {
      if (useServiceRole && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return createClient(
          this.supabaseUrl,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
        );
      }
      return createClient(this.supabaseUrl, this.supabaseAnonKey);
    } catch (error) {
      console.error("EventLogger: Failed to create Supabase client", error);
      throw error;
    }
  }

  /**
   * Log an event to database
   * Main entry point for event logging
   */
  async logEvent(
    event: SystemEvent,
    context?: Partial<EventContext>,
  ): Promise<EventLogEntry | null> {
    try {
      // Validate payload
      if (!this.validateEventPayload(event.eventType, event.payload)) {
        console.error(`EventLogger: Validation failed for ${event.eventType}`);
        return null;
      }

      // Build correlation ID if not provided
      const correlationId = context?.correlationId || generateUUID();
      const traceId = context?.traceId || generateUUID();
      const spanId = context?.spanId || generateUUID();

      // Prepare masked payload
      const piiFields = await this.getPiiFieldsForEvent(event.eventType);
      const payloadMasked = this.maskPii(event.payload, piiFields);

      // Build log entry
      const logEntry: Omit<EventLogEntry, "eventId" | "createdAt"> = {
        eventType: event.eventType,
        userId: context?.userId,
        projectId: context?.projectId,
        correlationId,
        traceId,
        spanId,
        payload: event.payload,
        payloadMasked,
        httpMethod: context?.httpMethod,
        httpPath: context?.httpPath,
        httpStatusCode: context?.httpStatusCode,
        source: context?.source || "api",
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        severity: event.severity || "info",
        tags: event.tags || [],
      };

      // Insert to database
      const supabase = this.getSupabaseClient(true); // Use service role for insert
      const { data, error } = await supabase
        .from("core_event_log")
        .insert([logEntry])
        .select()
        .single();

      if (error) {
        console.error("EventLogger: Database insert failed", error);
        // Don't throw - log failures should not crash the app
        return null;
      }

      // Cache for potential aggregation
      this.cacheEvent(event.eventType, data);

      console.debug(
        `EventLogger: Event logged - ${event.eventType} (${data.eventId})`,
      );

      return data as EventLogEntry;
    } catch (error) {
      console.error("EventLogger: Error logging event", error);
      // Fail silently - logging failures should not impact user experience
      return null;
    }
  }

  /**
   * Cache event for local aggregation
   */
  private cacheEvent(eventType: string, data: CachedEventData): void {
    const cacheKey = `${eventType}:${new Date().toISOString().split("T")[0]}`;
    const cached = this.eventCache.get(cacheKey) || [];
    cached.push(data);
    this.eventCache.set(cacheKey, cached);
  }

  /**
   * Get PII fields for an event type from database
   */
  private async getPiiFieldsForEvent(eventType: string): Promise<string[]> {
    try {
      const supabase = this.getSupabaseClient();
      const { data, error } = await supabase
        .from("event_definitions")
        .select("pii_fields")
        .eq("event_type", eventType)
        .single();

      if (error || !data) {
        return [];
      }

      return data.pii_fields || [];
    } catch (error) {
      console.warn("EventLogger: Failed to fetch PII fields", error);
      return [];
    }
  }

  /**
   * Batch log events
   */
  async logEvents(
    events: Array<{ event: SystemEvent; context?: Partial<EventContext> }>,
  ): Promise<EventLogEntry[]> {
    const results = await Promise.all(
      events.map(({ event, context }) => this.logEvent(event, context)),
    );
    return results.filter((r): r is EventLogEntry => r !== null);
  }

  /**
   * Query events with filters
   */
  async queryEvents(filters: {
    eventType?: string;
    userId?: string;
    projectId?: string;
    correlationId?: string;
    severity?: EventSeverity;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
  }): Promise<EventLogEntry[]> {
    try {
      const supabase = this.getSupabaseClient();
      let query = supabase.from("core_event_log").select("*");

      if (filters.eventType) {
        query = query.eq("event_type", filters.eventType);
      }
      if (filters.userId) {
        query = query.eq("user_id", filters.userId);
      }
      if (filters.projectId) {
        query = query.eq("project_id", filters.projectId);
      }
      if (filters.correlationId) {
        query = query.eq("correlation_id", filters.correlationId);
      }
      if (filters.severity) {
        query = query.eq("severity", filters.severity);
      }
      if (filters.dateFrom) {
        query = query.gte("created_at", filters.dateFrom.toISOString());
      }
      if (filters.dateTo) {
        query = query.lte("created_at", filters.dateTo.toISOString());
      }

      query = query.order("created_at", { ascending: false });

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error("EventLogger: Query failed", error);
        return [];
      }

      return data as EventLogEntry[];
    } catch (error) {
      console.error("EventLogger: Error querying events", error);
      return [];
    }
  }

  /**
   * Get event statistics
   */
  async getEventStats(
    eventType: string,
    timeWindowMinutes: number = 60,
  ): Promise<{ count: number; errorRate: number; avgExecutionTime?: number }> {
    try {
      const supabase = this.getSupabaseClient();
      const fromTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

      const { data, error } = await supabase
        .from("core_event_log")
        .select("*")
        .eq("event_type", eventType)
        .gte("created_at", fromTime.toISOString());

      if (error || !data) {
        return { count: 0, errorRate: 0 };
      }

      const count = data.length;
      const errorCount = data.filter(
        (e: { severity?: string }) => e.severity === "error",
      ).length;
      const errorRate = count > 0 ? (errorCount / count) * 100 : 0;

      return { count, errorRate };
    } catch (error) {
      console.error("EventLogger: Error getting stats", error);
      return { count: 0, errorRate: 0 };
    }
  }

  /**
   * Clear old events (for retention policy)
   */
  async clearOldEvents(retentionDays: number = 90): Promise<number> {
    try {
      const supabase = this.getSupabaseClient(true); // Use service role
      const cutoffDate = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1000,
      );

      const { data, error } = await supabase
        .from("core_event_log")
        .delete()
        .lt("created_at", cutoffDate.toISOString())
        .select("count");

      if (error) {
        console.error("EventLogger: Retention cleanup failed", error);
        return 0;
      }

      return data?.length || 0;
    } catch (error) {
      console.error("EventLogger: Error clearing old events", error);
      return 0;
    }
  }
}

// ============================================================
// Singleton Export
// ============================================================

let eventLoggerInstance: EventLogger | null = null;

export function getEventLogger(): EventLogger {
  if (!eventLoggerInstance) {
    eventLoggerInstance = new EventLogger();
  }
  return eventLoggerInstance;
}

export function createEventLogger(
  supabaseUrl: string,
  supabaseAnonKey: string,
): EventLogger {
  return new EventLogger(supabaseUrl, supabaseAnonKey);
}
