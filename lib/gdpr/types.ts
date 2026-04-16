/**
 * GDPR Compliance Types
 * Type definitions for consent management, data requests, and privacy controls
 */

// ============================================================
// Consent Types
// ============================================================

export type ConsentType =
  | "essential" // Required for service operation
  | "analytics" // Usage analytics
  | "marketing" // Marketing communications
  | "third_party" // Third-party integrations
  | "ai_processing" // AI/ML processing
  | "profiling" // Personalization
  | "social_scraping" // Social media data
  | "data_retention"; // Extended retention

export type ConsentSource = "signup" | "settings" | "banner" | "api" | "admin";

export type LegalBasis =
  | "consent"
  | "contract"
  | "legal_obligation"
  | "vital_interests"
  | "public_task"
  | "legitimate_interest";

export interface Consent {
  id: string;
  userId: string;
  consentType: ConsentType;
  granted: boolean;
  grantedAt: Date | null;
  revokedAt: Date | null;
  consentVersion: string;
  ipAddress: string | null;
  userAgent: string | null;
  consentSource: ConsentSource;
  legalBasis: LegalBasis;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConsentUpdate {
  consentType: ConsentType;
  granted: boolean;
  consentSource?: ConsentSource;
  legalBasis?: LegalBasis;
}

export interface ConsentStatus {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
  thirdParty: boolean;
  aiProcessing: boolean;
  profiling: boolean;
  socialScraping: boolean;
  dataRetention: boolean;
}

// ============================================================
// Data Request Types
// ============================================================

export type DataRequestType =
  | "export" // Right to access (Art. 15)
  | "delete" // Right to erasure (Art. 17)
  | "rectify" // Right to rectification (Art. 16)
  | "restrict" // Right to restrict (Art. 18)
  | "portability" // Data portability (Art. 20)
  | "objection"; // Right to object (Art. 21)

export type DataRequestStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type DataCategory =
  | "identity"
  | "contact"
  | "financial"
  | "behavioral"
  | "content"
  | "social"
  | "technical"
  | "ai_derived"
  | "communications";

export type ExportFormat = "json" | "csv" | "zip";

export interface DataRequest {
  id: string;
  userId: string;
  requestType: DataRequestType;
  status: DataRequestStatus;
  reason: string | null;
  scope: DataCategory[];
  processedBy: string | null;
  processedAt: Date | null;
  processingNotes: string | null;
  exportUrl: string | null;
  exportExpiresAt: Date | null;
  exportFormat: ExportFormat | null;
  deletionConfirmed: boolean;
  dataCategoriesDeleted: string[] | null;
  verified: boolean;
  verificationMethod: string | null;
  verifiedAt: Date | null;
  deadlineAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDataRequest {
  requestType: DataRequestType;
  reason?: string;
  scope?: DataCategory[];
  exportFormat?: ExportFormat;
}

// ============================================================
// Processing Log Types
// ============================================================

export type ProcessingActivity =
  | "collect"
  | "store"
  | "process"
  | "analyze"
  | "share"
  | "export"
  | "delete"
  | "anonymize";

export interface ProcessingLogEntry {
  id: string;
  userId: string | null;
  dataCategory: DataCategory;
  processingActivity: ProcessingActivity;
  purpose: string;
  legalBasis: string;
  dataProcessor: string | null;
  recipient: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  retentionPeriod: string | null;
  scheduledDeletionAt: Date | null;
  createdAt: Date;
}

// ============================================================
// Retention Policy Types
// ============================================================

export type DeletionType =
  | "hard_delete"
  | "soft_delete"
  | "anonymize"
  | "archive";

export interface RetentionPolicy {
  id: string;
  dataCategory: string;
  tableName: string;
  retentionPeriod: string;
  retentionBasis: string;
  deletionType: DeletionType;
  autoDelete: boolean;
  lastCleanupAt: Date | null;
  nextCleanupAt: Date | null;
  policyVersion: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Anonymization Types
// ============================================================

export type AnonymizationMethod =
  | "hash"
  | "pseudonymize"
  | "generalize"
  | "suppress"
  | "noise_addition"
  | "data_masking";

export interface AnonymizationLog {
  id: string;
  originalUserId: string | null;
  tableName: string;
  recordCount: number;
  anonymizationMethod: AnonymizationMethod;
  fieldsAnonymized: string[];
  verifiedComplete: boolean;
  verificationMethod: string | null;
  dataRequestId: string | null;
  createdAt: Date;
}

// ============================================================
// Data Sharing Types
// ============================================================

export type RecipientType =
  | "processor"
  | "controller"
  | "authority"
  | "user_request";

export interface DataSharingLog {
  id: string;
  userId: string | null;
  recipientName: string;
  recipientType: RecipientType;
  recipientCountry: string | null;
  dataCategories: DataCategory[];
  purpose: string;
  legalBasis: string;
  safeguards: string | null;
  dpaInPlace: boolean;
  transferMethod: string | null;
  encryptionUsed: boolean;
  createdAt: Date;
}

// ============================================================
// Export Data Types
// ============================================================

export interface UserDataExport {
  exportDate: string;
  userId: string;
  profile: {
    email: string;
    name: string | null;
    createdAt: string;
  };
  projects: unknown[];
  preferences: unknown[];
  brainFacts: unknown[];
  missions: unknown[];
  consents: Consent[];
  subscriptions: unknown[];
  onboarding: unknown[];
}

// ============================================================
// Privacy Settings
// ============================================================

export interface PrivacySettings {
  userId: string;
  consents: ConsentStatus;
  dataRetention: {
    extendedRetention: boolean;
    retentionPeriodDays: number;
  };
  communications: {
    emailMarketing: boolean;
    emailTransactional: boolean;
    pushNotifications: boolean;
  };
  thirdParty: {
    analyticsEnabled: boolean;
    aiProcessingEnabled: boolean;
    socialSharingEnabled: boolean;
  };
}

// ============================================================
// Cookie Consent
// ============================================================

export interface CookieConsent {
  necessary: boolean; // Always true, required
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  timestamp: Date;
  version: string;
}

export interface CookiePreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
}
