/**
 * GDPR Service
 * Handles consent management, data export, deletion, and privacy controls
 */

import { createClient } from "@supabase/supabase-js";
import {
  Consent,
  ConsentType,
  ConsentUpdate,
  ConsentStatus,
  DataRequest,
  DataRequestType,
  CreateDataRequest,
  DataCategory,
  ProcessingActivity,
  ProcessingLogEntry,
  PrivacySettings,
  CookiePreferences,
  ExportFormat,
} from "./types";

// ============================================================
// GDPR Service Class
// ============================================================

export class GDPRService {
  private supabaseUrl: string;
  private supabaseServiceKey: string;

  constructor(supabaseUrl?: string, supabaseServiceKey?: string) {
    this.supabaseUrl =
      supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    this.supabaseServiceKey =
      supabaseServiceKey || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  }

  /**
   * Get Supabase admin client (bypasses RLS)
   */
  private getAdminClient() {
    return createClient(this.supabaseUrl, this.supabaseServiceKey, {
      auth: { persistSession: false },
    });
  }

  // ============================================================
  // CONSENT MANAGEMENT
  // ============================================================

  /**
   * Get all consents for a user
   */
  async getConsents(userId: string): Promise<Consent[]> {
    const supabase = this.getAdminClient();

    const { data, error } = await supabase
      .from("gdpr_consents")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("Failed to get consents:", error);
      throw new Error(`Failed to get consents: ${error.message}`);
    }

    return (data || []).map(this.mapConsentFromDb);
  }

  /**
   * Get consent status summary for a user
   */
  async getConsentStatus(userId: string): Promise<ConsentStatus> {
    const consents = await this.getConsents(userId);
    const consentMap = new Map(consents.map((c) => [c.consentType, c.granted]));

    return {
      essential: consentMap.get("essential") ?? true, // Always true for essential
      analytics: consentMap.get("analytics") ?? false,
      marketing: consentMap.get("marketing") ?? false,
      thirdParty: consentMap.get("third_party") ?? false,
      aiProcessing: consentMap.get("ai_processing") ?? false,
      profiling: consentMap.get("profiling") ?? false,
      socialScraping: consentMap.get("social_scraping") ?? false,
      dataRetention: consentMap.get("data_retention") ?? false,
    };
  }

  /**
   * Check if user has specific consent
   */
  async hasConsent(userId: string, consentType: ConsentType): Promise<boolean> {
    const supabase = this.getAdminClient();

    const { data, error } = await supabase
      .from("gdpr_consents")
      .select("granted")
      .eq("user_id", userId)
      .eq("consent_type", consentType)
      .eq("granted", true)
      .is("revoked_at", null)
      .single();

    if (error) {
      return false;
    }

    return data?.granted ?? false;
  }

  /**
   * Update consent for a user
   */
  async updateConsent(
    userId: string,
    update: ConsentUpdate,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<Consent> {
    const supabase = this.getAdminClient();

    const now = new Date().toISOString();
    const consentData = {
      user_id: userId,
      consent_type: update.consentType,
      granted: update.granted,
      granted_at: update.granted ? now : null,
      revoked_at: !update.granted ? now : null,
      consent_source: update.consentSource || "settings",
      legal_basis: update.legalBasis || "consent",
      ip_address: metadata?.ipAddress,
      user_agent: metadata?.userAgent,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from("gdpr_consents")
      .upsert(consentData, {
        onConflict: "user_id,consent_type",
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to update consent:", error);
      throw new Error(`Failed to update consent: ${error.message}`);
    }

    // Log the processing activity
    await this.logProcessing(userId, {
      dataCategory: "behavioral",
      activity: update.granted ? "collect" : "delete",
      purpose: `Consent ${update.granted ? "granted" : "revoked"} for ${update.consentType}`,
      legalBasis: update.legalBasis || "consent",
    });

    return this.mapConsentFromDb(data);
  }

  /**
   * Update multiple consents at once
   */
  async updateConsents(
    userId: string,
    updates: ConsentUpdate[],
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<Consent[]> {
    const results: Consent[] = [];

    for (const update of updates) {
      const result = await this.updateConsent(userId, update, metadata);
      results.push(result);
    }

    return results;
  }

  /**
   * Initialize default consents for new user
   */
  async initializeConsents(
    userId: string,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<Consent[]> {
    const defaultConsents: ConsentUpdate[] = [
      {
        consentType: "essential",
        granted: true,
        consentSource: "signup",
        legalBasis: "contract",
      },
      {
        consentType: "analytics",
        granted: false,
        consentSource: "signup",
        legalBasis: "consent",
      },
      {
        consentType: "marketing",
        granted: false,
        consentSource: "signup",
        legalBasis: "consent",
      },
      {
        consentType: "ai_processing",
        granted: true,
        consentSource: "signup",
        legalBasis: "contract",
      },
    ];

    return this.updateConsents(userId, defaultConsents, metadata);
  }

  // ============================================================
  // DATA REQUESTS
  // ============================================================

  /**
   * Create a data request (export, delete, etc.)
   */
  async createDataRequest(
    userId: string,
    request: CreateDataRequest,
  ): Promise<DataRequest> {
    const supabase = this.getAdminClient();

    const { data, error } = await supabase
      .from("gdpr_data_requests")
      .insert({
        user_id: userId,
        request_type: request.requestType,
        reason: request.reason,
        scope: request.scope || ["all"],
        export_format: request.exportFormat || "json",
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create data request:", error);
      throw new Error(`Failed to create data request: ${error.message}`);
    }

    // Log the processing activity
    await this.logProcessing(userId, {
      dataCategory: "identity",
      activity: "process",
      purpose: `GDPR ${request.requestType} request submitted`,
      legalBasis: "legal_obligation",
    });

    return this.mapDataRequestFromDb(data);
  }

  /**
   * Get data requests for a user
   */
  async getDataRequests(userId: string): Promise<DataRequest[]> {
    const supabase = this.getAdminClient();

    const { data, error } = await supabase
      .from("gdpr_data_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to get data requests:", error);
      throw new Error(`Failed to get data requests: ${error.message}`);
    }

    return (data || []).map(this.mapDataRequestFromDb);
  }

  /**
   * Get a specific data request
   */
  async getDataRequest(requestId: string): Promise<DataRequest | null> {
    const supabase = this.getAdminClient();

    const { data, error } = await supabase
      .from("gdpr_data_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error(`Failed to get data request: ${error.message}`);
    }

    return this.mapDataRequestFromDb(data);
  }

  /**
   * Process a data export request
   */
  async processExportRequest(requestId: string): Promise<string> {
    const supabase = this.getAdminClient();

    // Get the request
    const request = await this.getDataRequest(requestId);
    if (!request) {
      throw new Error("Data request not found");
    }

    if (request.requestType !== "export") {
      throw new Error("Invalid request type for export");
    }

    // Update status to processing
    await supabase
      .from("gdpr_data_requests")
      .update({
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    try {
      // Get user data using the database function
      const { data: exportData, error: exportError } = await supabase.rpc(
        "get_user_data_export",
        { p_user_id: request.userId },
      );

      if (exportError) {
        throw exportError;
      }

      // In production, you'd upload this to secure storage and generate a signed URL
      // For now, we'll store it as JSON
      const exportJson = JSON.stringify(exportData, null, 2);
      const exportUrl = `data:application/json;base64,${Buffer.from(exportJson).toString("base64")}`;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

      // Update request with export URL
      await supabase
        .from("gdpr_data_requests")
        .update({
          status: "completed",
          export_url: exportUrl,
          export_expires_at: expiresAt.toISOString(),
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      // Log the export
      await this.logProcessing(request.userId, {
        dataCategory: "identity",
        activity: "export",
        purpose: "GDPR data export request fulfilled",
        legalBasis: "legal_obligation",
      });

      return exportUrl;
    } catch (error) {
      // Mark as failed
      await supabase
        .from("gdpr_data_requests")
        .update({
          status: "failed",
          processing_notes:
            error instanceof Error ? error.message : "Unknown error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      throw error;
    }
  }

  /**
   * Process a data deletion request
   */
  async processDeleteRequest(requestId: string): Promise<void> {
    const supabase = this.getAdminClient();

    const request = await this.getDataRequest(requestId);
    if (!request) {
      throw new Error("Data request not found");
    }

    if (request.requestType !== "delete") {
      throw new Error("Invalid request type for deletion");
    }

    // Update status to processing
    await supabase
      .from("gdpr_data_requests")
      .update({
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    const deletedCategories: string[] = [];

    try {
      // Delete user data in order (respecting foreign keys)
      // Note: In production, you'd want more granular control

      // 1. Anonymize event logs
      await supabase
        .from("core_event_log")
        .update({ user_id: null })
        .eq("user_id", request.userId);
      deletedCategories.push("event_logs");

      // 2. Delete notifications
      await supabase
        .from("notifications")
        .delete()
        .eq("user_id", request.userId);
      deletedCategories.push("notifications");

      // 3. Get projects for cascading deletes
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", request.userId);

      const projectIds = (projects || []).map((p) => p.id);

      if (projectIds.length > 0) {
        // 4. Delete brain data
        await supabase
          .from("brain_facts")
          .delete()
          .in("project_id", projectIds);
        deletedCategories.push("brain_data");

        // 5. Delete missions
        await supabase
          .from("mission_instances")
          .delete()
          .in("project_id", projectIds);
        deletedCategories.push("missions");

        // 6. Delete scrape data
        await supabase
          .from("core_scrape_runs")
          .delete()
          .in("project_id", projectIds);
        deletedCategories.push("scrape_data");

        // 7. Delete calendar items
        await supabase
          .from("core_calendar_items")
          .delete()
          .in("project_id", projectIds);
        deletedCategories.push("calendar_items");

        // 8. Delete projects (will cascade to preferences, wallets, etc.)
        await supabase.from("projects").delete().eq("user_id", request.userId);
        deletedCategories.push("projects");
      }

      // 9. Delete consents
      await supabase
        .from("gdpr_consents")
        .delete()
        .eq("user_id", request.userId);
      deletedCategories.push("consents");

      // 10. Delete subscriptions
      await supabase
        .from("core_subscriptions")
        .delete()
        .eq("user_id", request.userId);
      deletedCategories.push("subscriptions");

      // Note: We do NOT delete auth.users here - that requires Supabase admin
      // The user account deletion should be handled separately

      // Update request as completed
      await supabase
        .from("gdpr_data_requests")
        .update({
          status: "completed",
          deletion_confirmed: true,
          data_categories_deleted: deletedCategories,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      // Log the deletion
      await this.logProcessing(request.userId, {
        dataCategory: "identity",
        activity: "delete",
        purpose: "GDPR right to erasure fulfilled",
        legalBasis: "legal_obligation",
      });

      // Log anonymization
      await supabase.from("gdpr_anonymization_log").insert({
        original_user_id: request.userId,
        table_name: "multiple",
        record_count: deletedCategories.length,
        anonymization_method: "suppress",
        fields_anonymized: deletedCategories,
        verified_complete: true,
        data_request_id: requestId,
      });
    } catch (error) {
      await supabase
        .from("gdpr_data_requests")
        .update({
          status: "failed",
          processing_notes:
            error instanceof Error ? error.message : "Unknown error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      throw error;
    }
  }

  // ============================================================
  // PROCESSING LOG
  // ============================================================

  /**
   * Log a data processing activity
   */
  async logProcessing(
    userId: string,
    entry: {
      dataCategory: DataCategory;
      activity: ProcessingActivity;
      purpose: string;
      legalBasis: string;
      processor?: string;
      recipient?: string;
      ipAddress?: string;
      userAgent?: string;
      requestId?: string;
    },
  ): Promise<void> {
    const supabase = this.getAdminClient();

    await supabase.from("gdpr_processing_log").insert({
      user_id: userId,
      data_category: entry.dataCategory,
      processing_activity: entry.activity,
      purpose: entry.purpose,
      legal_basis: entry.legalBasis,
      data_processor: entry.processor,
      recipient: entry.recipient,
      ip_address: entry.ipAddress,
      user_agent: entry.userAgent,
      request_id: entry.requestId,
    });
  }

  /**
   * Get processing log for a user
   */
  async getProcessingLog(
    userId: string,
    limit = 100,
  ): Promise<ProcessingLogEntry[]> {
    const supabase = this.getAdminClient();

    const { data, error } = await supabase
      .from("gdpr_processing_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get processing log: ${error.message}`);
    }

    return (data || []).map(this.mapProcessingLogFromDb);
  }

  // ============================================================
  // DATA SHARING LOG
  // ============================================================

  /**
   * Log data sharing with third party
   */
  async logDataSharing(entry: {
    userId: string;
    recipientName: string;
    recipientType: "processor" | "controller" | "authority" | "user_request";
    recipientCountry?: string;
    dataCategories: DataCategory[];
    purpose: string;
    legalBasis: string;
    safeguards?: string;
    dpaInPlace?: boolean;
  }): Promise<void> {
    const supabase = this.getAdminClient();

    await supabase.from("gdpr_data_sharing_log").insert({
      user_id: entry.userId,
      recipient_name: entry.recipientName,
      recipient_type: entry.recipientType,
      recipient_country: entry.recipientCountry,
      data_categories: entry.dataCategories,
      purpose: entry.purpose,
      legal_basis: entry.legalBasis,
      safeguards: entry.safeguards,
      dpa_in_place: entry.dpaInPlace ?? false,
    });
  }

  // ============================================================
  // PRIVACY SETTINGS
  // ============================================================

  /**
   * Get privacy settings for a user
   */
  async getPrivacySettings(userId: string): Promise<PrivacySettings> {
    const consents = await this.getConsentStatus(userId);

    return {
      userId,
      consents,
      dataRetention: {
        extendedRetention: consents.dataRetention,
        retentionPeriodDays: consents.dataRetention ? 1095 : 365, // 3 years vs 1 year
      },
      communications: {
        emailMarketing: consents.marketing,
        emailTransactional: true, // Always enabled
        pushNotifications: consents.marketing,
      },
      thirdParty: {
        analyticsEnabled: consents.analytics,
        aiProcessingEnabled: consents.aiProcessing,
        socialSharingEnabled: consents.thirdParty,
      },
    };
  }

  // ============================================================
  // COOKIE CONSENT
  // ============================================================

  /**
   * Save cookie preferences
   */
  async saveCookiePreferences(
    userId: string,
    preferences: CookiePreferences,
  ): Promise<void> {
    const updates: ConsentUpdate[] = [
      {
        consentType: "essential",
        granted: true, // Always required
        consentSource: "banner",
        legalBasis: "contract",
      },
      {
        consentType: "analytics",
        granted: preferences.analytics,
        consentSource: "banner",
        legalBasis: "consent",
      },
      {
        consentType: "marketing",
        granted: preferences.marketing,
        consentSource: "banner",
        legalBasis: "consent",
      },
    ];

    await this.updateConsents(userId, updates);
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private mapConsentFromDb(row: Record<string, unknown>): Consent {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      consentType: row.consent_type as ConsentType,
      granted: row.granted as boolean,
      grantedAt: row.granted_at ? new Date(row.granted_at as string) : null,
      revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : null,
      consentVersion: row.consent_version as string,
      ipAddress: row.ip_address as string | null,
      userAgent: row.user_agent as string | null,
      consentSource: row.consent_source as Consent["consentSource"],
      legalBasis: row.legal_basis as Consent["legalBasis"],
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapDataRequestFromDb(row: Record<string, unknown>): DataRequest {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      requestType: row.request_type as DataRequestType,
      status: row.status as DataRequest["status"],
      reason: row.reason as string | null,
      scope: row.scope as DataCategory[],
      processedBy: row.processed_by as string | null,
      processedAt: row.processed_at
        ? new Date(row.processed_at as string)
        : null,
      processingNotes: row.processing_notes as string | null,
      exportUrl: row.export_url as string | null,
      exportExpiresAt: row.export_expires_at
        ? new Date(row.export_expires_at as string)
        : null,
      exportFormat: row.export_format as ExportFormat | null,
      deletionConfirmed: row.deletion_confirmed as boolean,
      dataCategoriesDeleted: row.data_categories_deleted as string[] | null,
      verified: row.verified as boolean,
      verificationMethod: row.verification_method as string | null,
      verifiedAt: row.verified_at ? new Date(row.verified_at as string) : null,
      deadlineAt: new Date(row.deadline_at as string),
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapProcessingLogFromDb(
    row: Record<string, unknown>,
  ): ProcessingLogEntry {
    return {
      id: row.id as string,
      userId: row.user_id as string | null,
      dataCategory: row.data_category as DataCategory,
      processingActivity: row.processing_activity as ProcessingActivity,
      purpose: row.purpose as string,
      legalBasis: row.legal_basis as string,
      dataProcessor: row.data_processor as string | null,
      recipient: row.recipient as string | null,
      ipAddress: row.ip_address as string | null,
      userAgent: row.user_agent as string | null,
      requestId: row.request_id as string | null,
      retentionPeriod: row.retention_period as string | null,
      scheduledDeletionAt: row.scheduled_deletion_at
        ? new Date(row.scheduled_deletion_at as string)
        : null,
      createdAt: new Date(row.created_at as string),
    };
  }
}

// ============================================================
// Singleton Instance
// ============================================================

let gdprServiceInstance: GDPRService | null = null;

export function getGDPRService(): GDPRService {
  if (!gdprServiceInstance) {
    gdprServiceInstance = new GDPRService();
  }
  return gdprServiceInstance;
}
