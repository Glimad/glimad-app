/**
 * GDPR Compliance Module
 *
 * This module provides comprehensive GDPR compliance functionality:
 * - Consent management (Art. 7)
 * - Right to access (Art. 15)
 * - Right to rectification (Art. 16)
 * - Right to erasure (Art. 17)
 * - Right to restrict processing (Art. 18)
 * - Right to data portability (Art. 20)
 * - Right to object (Art. 21)
 *
 * Database: supabase/migrations/024_gdpr_compliance.sql
 */

// Service
export { GDPRService, getGDPRService } from "./gdpr-service";

// Types - Consent
export type {
  ConsentType,
  ConsentSource,
  LegalBasis,
  Consent,
  ConsentUpdate,
  ConsentStatus,
} from "./types";

// Types - Data Requests
export type {
  DataRequestType,
  DataRequestStatus,
  DataCategory,
  ExportFormat,
  DataRequest,
  CreateDataRequest,
} from "./types";

// Types - Processing
export type {
  ProcessingActivity,
  ProcessingLogEntry,
  RetentionPolicy,
  DeletionType,
} from "./types";

// Types - Anonymization
export type { AnonymizationMethod, AnonymizationLog } from "./types";

// Types - Data Sharing
export type { RecipientType, DataSharingLog } from "./types";

// Types - User-facing
export type {
  UserDataExport,
  PrivacySettings,
  CookieConsent,
  CookiePreferences,
} from "./types";
