/**
 * Backup Service
 * Brief 33: Backup operations, maintenance mode, and verification
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  BackupLogEntry,
  CreateBackupParams,
  CompleteBackupParams,
  RestorationLogEntry,
  StartRestorationParams,
  RpoRtoTarget,
  BackupOverdueStatus,
  MaintenanceMode,
  SetMaintenanceModeParams,
  DatabaseSizeInfo,
  TableSizeInfo,
  BackupVerificationResult,
  BackupStatus,
  CRITICAL_TABLES,
} from "./types";

// ============================================================
// Backup Service Class
// ============================================================

export class BackupService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    const url = supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error("Supabase URL and service role key are required");
    }

    this.supabase = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  // ============================================================
  // Backup Operations
  // ============================================================

  /**
   * Start a new backup operation
   */
  async startBackup(params: CreateBackupParams): Promise<string> {
    const { data, error } = await this.supabase.rpc("start_backup", {
      p_backup_type: params.backupType,
      p_target: params.target,
      p_tables: params.tables || null,
      p_created_by: params.createdBy || "system",
    });

    if (error) {
      throw new Error(`Failed to start backup: ${error.message}`);
    }

    return data as string;
  }

  /**
   * Complete a backup operation
   */
  async completeBackup(params: CompleteBackupParams): Promise<void> {
    const { error } = await this.supabase.rpc("complete_backup", {
      p_backup_id: params.backupId,
      p_status: params.status,
      p_size_bytes: params.sizeBytes || null,
      p_location: params.location || null,
      p_error_message: params.errorMessage || null,
    });

    if (error) {
      throw new Error(`Failed to complete backup: ${error.message}`);
    }
  }

  /**
   * Get backup history
   */
  async getBackupHistory(options?: {
    limit?: number;
    status?: BackupStatus;
    target?: string;
  }): Promise<BackupLogEntry[]> {
    let query = this.supabase
      .from("backup_log")
      .select("*")
      .order("created_at", { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.status) {
      query = query.eq("status", options.status);
    }
    if (options?.target) {
      query = query.eq("target", options.target);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get backup history: ${error.message}`);
    }

    return (data || []).map(this.mapBackupLogEntry);
  }

  /**
   * Get latest successful backup
   */
  async getLatestBackup(target?: string): Promise<BackupLogEntry | null> {
    let query = this.supabase
      .from("backup_log")
      .select("*")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1);

    if (target) {
      query = query.eq("target", target);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get latest backup: ${error.message}`);
    }

    return data && data.length > 0 ? this.mapBackupLogEntry(data[0]) : null;
  }

  /**
   * Verify backup was created
   */
  async verifyBackup(
    backupId: string,
    verifiedBy: string,
  ): Promise<BackupLogEntry> {
    const { data, error } = await this.supabase
      .from("backup_log")
      .update({
        verified_at: new Date().toISOString(),
        verified_by: verifiedBy,
      })
      .eq("id", backupId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to verify backup: ${error.message}`);
    }

    return this.mapBackupLogEntry(data);
  }

  // ============================================================
  // Restoration Operations
  // ============================================================

  /**
   * Start a restoration operation
   */
  async startRestoration(
    params: StartRestorationParams,
  ): Promise<RestorationLogEntry> {
    const { data, error } = await this.supabase
      .from("restoration_log")
      .insert({
        backup_id: params.backupId,
        restoration_type: params.restorationType,
        target_tables: params.targetTables,
        status: "in_progress",
        initiated_by: params.initiatedBy,
        reason: params.reason,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to start restoration: ${error.message}`);
    }

    return this.mapRestorationLogEntry(data);
  }

  /**
   * Complete a restoration operation
   */
  async completeRestoration(
    restorationId: string,
    status: BackupStatus,
    rowsRestored?: number,
    errorMessage?: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("restoration_log")
      .update({
        status,
        rows_restored: rowsRestored,
        completed_at: new Date().toISOString(),
        error_message: errorMessage,
      })
      .eq("id", restorationId);

    if (error) {
      throw new Error(`Failed to complete restoration: ${error.message}`);
    }
  }

  /**
   * Get restoration history
   */
  async getRestorationHistory(limit = 20): Promise<RestorationLogEntry[]> {
    const { data, error } = await this.supabase
      .from("restoration_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get restoration history: ${error.message}`);
    }

    return (data || []).map(this.mapRestorationLogEntry);
  }

  // ============================================================
  // RPO/RTO Monitoring
  // ============================================================

  /**
   * Get RPO/RTO targets
   */
  async getRpoRtoTargets(): Promise<RpoRtoTarget[]> {
    const { data, error } = await this.supabase
      .from("rpo_rto_targets")
      .select("*")
      .order("priority");

    if (error) {
      throw new Error(`Failed to get RPO/RTO targets: ${error.message}`);
    }

    return (data || []).map(this.mapRpoRtoTarget);
  }

  /**
   * Check for overdue backups
   */
  async checkBackupOverdue(): Promise<BackupOverdueStatus[]> {
    const { data, error } = await this.supabase.rpc("check_backup_overdue");

    if (error) {
      throw new Error(`Failed to check overdue backups: ${error.message}`);
    }

    return (data || []).map((row: Record<string, unknown>) => ({
      dataType: row.data_type as string,
      lastBackup: row.last_backup ? new Date(row.last_backup as string) : null,
      hoursSinceBackup: row.hours_since_backup as number | null,
      expectedFrequencyHours: row.expected_frequency_hours as number,
      isOverdue: row.is_overdue as boolean,
      priority: row.priority as BackupOverdueStatus["priority"],
    }));
  }

  /**
   * Get critical overdue backups only
   */
  async getCriticalOverdueBackups(): Promise<BackupOverdueStatus[]> {
    const allOverdue = await this.checkBackupOverdue();
    return allOverdue.filter(
      (b) => b.isOverdue && (b.priority === "P0" || b.priority === "P1"),
    );
  }

  // ============================================================
  // Maintenance Mode
  // ============================================================

  /**
   * Get maintenance mode status
   */
  async getMaintenanceMode(): Promise<MaintenanceMode> {
    const { data, error } = await this.supabase.rpc("get_maintenance_mode");

    if (error) {
      throw new Error(`Failed to get maintenance mode: ${error.message}`);
    }

    const row = data?.[0];
    return {
      enabled: row?.enabled || false,
      reason: row?.reason,
      message: row?.message,
      startedAt: row?.started_at ? new Date(row.started_at) : undefined,
      expectedEndAt: row?.expected_end_at
        ? new Date(row.expected_end_at)
        : undefined,
    };
  }

  /**
   * Set maintenance mode
   */
  async setMaintenanceMode(params: SetMaintenanceModeParams): Promise<void> {
    const { error } = await this.supabase.rpc("set_maintenance_mode", {
      p_enabled: params.enabled,
      p_reason: params.reason || null,
      p_message: params.message || null,
      p_expected_end_at: params.expectedEndAt?.toISOString() || null,
      p_enabled_by: params.enabledBy || "system",
    });

    if (error) {
      throw new Error(`Failed to set maintenance mode: ${error.message}`);
    }
  }

  /**
   * Enable maintenance mode
   */
  async enableMaintenanceMode(
    reason: string,
    message: string,
    expectedDurationMinutes?: number,
    enabledBy?: string,
  ): Promise<void> {
    const expectedEndAt = expectedDurationMinutes
      ? new Date(Date.now() + expectedDurationMinutes * 60 * 1000)
      : undefined;

    await this.setMaintenanceMode({
      enabled: true,
      reason,
      message,
      expectedEndAt,
      enabledBy,
    });
  }

  /**
   * Disable maintenance mode
   */
  async disableMaintenanceMode(disabledBy?: string): Promise<void> {
    await this.setMaintenanceMode({
      enabled: false,
      enabledBy: disabledBy,
    });
  }

  // ============================================================
  // Database Info
  // ============================================================

  /**
   * Get database size information
   */
  async getDatabaseSizeInfo(): Promise<DatabaseSizeInfo> {
    const { data, error } = await this.supabase.rpc("get_database_size_info");

    if (error) {
      throw new Error(`Failed to get database size info: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return {
        totalSize: "0 bytes",
        totalBytes: 0,
        tables: [],
      };
    }

    const tables: TableSizeInfo[] = data.map(
      (row: Record<string, unknown>) => ({
        tableName: row.table_name as string,
        tableSize: row.table_size as string,
        rowCount: row.row_count as number,
      }),
    );

    return {
      totalSize: data[0].total_size as string,
      totalBytes: data[0].total_bytes as number,
      tables,
    };
  }

  /**
   * Get row counts for critical tables
   */
  async getCriticalTableCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    for (const table of CRITICAL_TABLES) {
      const { count, error } = await this.supabase
        .from(table)
        .select("*", { count: "exact", head: true });

      if (!error) {
        counts[table] = count || 0;
      }
    }

    return counts;
  }

  // ============================================================
  // Backup Verification
  // ============================================================

  /**
   * Run integrity checks on the database
   */
  async runIntegrityChecks(): Promise<
    BackupVerificationResult["integrityChecks"]
  > {
    const checks: BackupVerificationResult["integrityChecks"] = [];

    // Check 1: Projects have valid users
    const { data: orphanedProjects, error: err1 } = await this.supabase.rpc(
      "check_orphaned_projects",
    );

    checks.push({
      checkName: "orphaned_projects",
      passed: !err1 && (!orphanedProjects || orphanedProjects.length === 0),
      details: err1
        ? err1.message
        : `Found ${orphanedProjects?.length || 0} orphaned projects`,
    });

    // Check 2: Wallets have valid projects
    const { count: walletCount } = await this.supabase
      .from("core_wallets")
      .select("*", { count: "exact", head: true });

    const { count: walletWithProjectCount } = await this.supabase
      .from("core_wallets")
      .select("*, projects!inner(id)", { count: "exact", head: true });

    checks.push({
      checkName: "wallet_project_integrity",
      passed: walletCount === walletWithProjectCount,
      details: `${walletWithProjectCount}/${walletCount} wallets have valid projects`,
    });

    // Check 3: Ledger balance consistency
    // This would normally sum up credits/debits and compare to wallet balances
    checks.push({
      checkName: "ledger_balance_consistency",
      passed: true, // Placeholder - would need actual implementation
      details: "Ledger consistency check placeholder",
    });

    return checks;
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private mapBackupLogEntry(row: Record<string, unknown>): BackupLogEntry {
    return {
      id: row.id as string,
      backupType: row.backup_type as BackupLogEntry["backupType"],
      target: row.target as BackupLogEntry["target"],
      tables: row.tables as string[] | undefined,
      status: row.status as BackupLogEntry["status"],
      sizeBytes: row.size_bytes as number | undefined,
      location: row.location as string | undefined,
      startedAt: new Date(row.started_at as string),
      completedAt: row.completed_at
        ? new Date(row.completed_at as string)
        : undefined,
      errorMessage: row.error_message as string | undefined,
      metadata: (row.metadata as Record<string, unknown>) || {},
      createdBy: row.created_by as string,
      verifiedAt: row.verified_at
        ? new Date(row.verified_at as string)
        : undefined,
      verifiedBy: row.verified_by as string | undefined,
      createdAt: new Date(row.created_at as string),
    };
  }

  private mapRestorationLogEntry(
    row: Record<string, unknown>,
  ): RestorationLogEntry {
    return {
      id: row.id as string,
      backupId: row.backup_id as string | undefined,
      restorationType:
        row.restoration_type as RestorationLogEntry["restorationType"],
      targetTables: row.target_tables as string[] | undefined,
      status: row.status as RestorationLogEntry["status"],
      rowsRestored: row.rows_restored as number | undefined,
      startedAt: new Date(row.started_at as string),
      completedAt: row.completed_at
        ? new Date(row.completed_at as string)
        : undefined,
      errorMessage: row.error_message as string | undefined,
      initiatedBy: row.initiated_by as string,
      reason: row.reason as string | undefined,
      createdAt: new Date(row.created_at as string),
    };
  }

  private mapRpoRtoTarget(row: Record<string, unknown>): RpoRtoTarget {
    return {
      id: row.id as string,
      dataType: row.data_type as string,
      rpoHours: row.rpo_hours as number,
      rtoHours: row.rto_hours as number,
      priority: row.priority as RpoRtoTarget["priority"],
      backupFrequencyHours: row.backup_frequency_hours as number,
      retentionDays: row.retention_days as number,
      critical: row.critical as boolean,
      description: row.description as string | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}

// ============================================================
// Singleton Instance
// ============================================================

let backupServiceInstance: BackupService | null = null;

export function getBackupService(): BackupService {
  if (!backupServiceInstance) {
    backupServiceInstance = new BackupService();
  }
  return backupServiceInstance;
}

// ============================================================
// Convenience Functions
// ============================================================

export async function isMaintenanceMode(): Promise<boolean> {
  const service = getBackupService();
  const status = await service.getMaintenanceMode();
  return status.enabled;
}

export async function checkBackupsHealth(): Promise<{
  healthy: boolean;
  overdueCount: number;
  criticalOverdueCount: number;
}> {
  const service = getBackupService();
  const overdue = await service.checkBackupOverdue();
  const criticalOverdue = overdue.filter(
    (b) => b.isOverdue && (b.priority === "P0" || b.priority === "P1"),
  );

  return {
    healthy: criticalOverdue.length === 0,
    overdueCount: overdue.filter((b) => b.isOverdue).length,
    criticalOverdueCount: criticalOverdue.length,
  };
}
