/**
 * Backup & Disaster Recovery Module
 *
 * Provides backup operations, restoration tracking, RPO/RTO monitoring,
 * and maintenance mode management for disaster recovery scenarios.
 *
 * Database: supabase/migrations/026_backup_disaster_recovery.sql
 *
 * Features:
 * - Backup logging and tracking
 * - Restoration operation logging
 * - RPO/RTO target monitoring
 * - Overdue backup detection
 * - Maintenance mode toggle
 * - Database size monitoring
 * - Integrity checks
 */

// Service
export {
  BackupService,
  getBackupService,
  isMaintenanceMode,
  checkBackupsHealth,
} from "./backup-service";

// Types - Backup
export type {
  BackupType,
  BackupTarget,
  BackupStatus,
  BackupLogEntry,
  CreateBackupParams,
  CompleteBackupParams,
} from "./types";

// Types - Restoration
export type {
  RestorationType,
  RestorationLogEntry,
  StartRestorationParams,
} from "./types";

// Types - RPO/RTO
export type { Priority, RpoRtoTarget, BackupOverdueStatus } from "./types";

// Types - Maintenance
export type { MaintenanceMode, SetMaintenanceModeParams } from "./types";

// Types - Database Info
export type { DatabaseSizeInfo, TableSizeInfo } from "./types";

// Types - Verification
export type {
  BackupVerificationResult,
  TableVerificationResult,
  IntegrityCheckResult,
} from "./types";

// Constants
export { CRITICAL_TABLES, IMPORTANT_TABLES, ALL_BACKUP_TABLES } from "./types";

export type { CriticalTable, ImportantTable, BackupTable } from "./types";
