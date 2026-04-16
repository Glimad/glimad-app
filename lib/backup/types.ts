/**
 * Backup & Disaster Recovery Types
 * Brief 33: Type definitions for backup operations
 */

// ============================================================
// Backup Types
// ============================================================

export type BackupType = "full" | "incremental" | "table" | "pitr";
export type BackupTarget = "database" | "storage" | "n8n" | "secrets";
export type BackupStatus = "pending" | "in_progress" | "completed" | "failed";

export interface BackupLogEntry {
  id: string;
  backupType: BackupType;
  target: BackupTarget;
  tables?: string[];
  status: BackupStatus;
  sizeBytes?: number;
  location?: string;
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  metadata: Record<string, unknown>;
  createdBy: string;
  verifiedAt?: Date;
  verifiedBy?: string;
  createdAt: Date;
}

export interface CreateBackupParams {
  backupType: BackupType;
  target: BackupTarget;
  tables?: string[];
  createdBy?: string;
}

export interface CompleteBackupParams {
  backupId: string;
  status: BackupStatus;
  sizeBytes?: number;
  location?: string;
  errorMessage?: string;
}

// ============================================================
// Restoration Types
// ============================================================

export type RestorationType = "full" | "table" | "pitr";

export interface RestorationLogEntry {
  id: string;
  backupId?: string;
  restorationType: RestorationType;
  targetTables?: string[];
  status: BackupStatus;
  rowsRestored?: number;
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  initiatedBy: string;
  reason?: string;
  createdAt: Date;
}

export interface StartRestorationParams {
  backupId?: string;
  restorationType: RestorationType;
  targetTables?: string[];
  initiatedBy: string;
  reason?: string;
}

// ============================================================
// RPO/RTO Types
// ============================================================

export type Priority = "P0" | "P1" | "P2" | "P3";

export interface RpoRtoTarget {
  id: string;
  dataType: string;
  rpoHours: number;
  rtoHours: number;
  priority: Priority;
  backupFrequencyHours: number;
  retentionDays: number;
  critical: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BackupOverdueStatus {
  dataType: string;
  lastBackup: Date | null;
  hoursSinceBackup: number | null;
  expectedFrequencyHours: number;
  isOverdue: boolean;
  priority: Priority;
}

// ============================================================
// Maintenance Mode Types
// ============================================================

export interface MaintenanceMode {
  enabled: boolean;
  reason?: string;
  message?: string;
  startedAt?: Date;
  expectedEndAt?: Date;
}

export interface SetMaintenanceModeParams {
  enabled: boolean;
  reason?: string;
  message?: string;
  expectedEndAt?: Date;
  enabledBy?: string;
}

// ============================================================
// Database Size Types
// ============================================================

export interface DatabaseSizeInfo {
  totalSize: string;
  totalBytes: number;
  tables: TableSizeInfo[];
}

export interface TableSizeInfo {
  tableName: string;
  tableSize: string;
  rowCount: number;
}

// ============================================================
// Backup Verification Types
// ============================================================

export interface BackupVerificationResult {
  backupId: string;
  verified: boolean;
  tables: TableVerificationResult[];
  integrityChecks: IntegrityCheckResult[];
  verifiedAt: Date;
  verifiedBy: string;
  notes?: string;
}

export interface TableVerificationResult {
  tableName: string;
  rowCount: number;
  expectedRowCount?: number;
  verified: boolean;
  error?: string;
}

export interface IntegrityCheckResult {
  checkName: string;
  passed: boolean;
  details?: string;
}

// ============================================================
// Critical Tables Configuration
// ============================================================

export const CRITICAL_TABLES = [
  "core_ledger",
  "core_wallets",
  "users",
  "projects",
  "core_subscriptions",
  "core_payments",
] as const;

export const IMPORTANT_TABLES = [
  "brain_facts",
  "brain_signals",
  "brain_snapshots",
  "mission_instances",
  "mission_templates",
] as const;

export const ALL_BACKUP_TABLES = [
  ...CRITICAL_TABLES,
  ...IMPORTANT_TABLES,
  "calendar_items",
  "scrape_requests",
  "scrape_runs",
  "event_log",
] as const;

export type CriticalTable = (typeof CRITICAL_TABLES)[number];
export type ImportantTable = (typeof IMPORTANT_TABLES)[number];
export type BackupTable = (typeof ALL_BACKUP_TABLES)[number];
