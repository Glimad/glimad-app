# Backup & Disaster Recovery Guide

**Brief 33: Backup Strategy, RPO/RTO Targets, Recovery Playbooks**

---

## Overview

This document defines the backup strategy, disaster recovery procedures, and RPO/RTO targets for Glimad v0.

### Goals

- **Protect** critical data against loss
- **Enable** rapid recovery in case of disaster
- **Comply** with user expectations (no loss of work)
- **Document** clear RPO/RTO targets

---

## RPO/RTO Targets

### Definitions

| Term                               | Definition                              |
| ---------------------------------- | --------------------------------------- |
| **RPO** (Recovery Point Objective) | Maximum amount of data that can be lost |
| **RTO** (Recovery Time Objective)  | Maximum time to restore service         |

### Targets by Data Type

| Data Type                       | RPO      | RTO         | Priority | Justification                   |
| ------------------------------- | -------- | ----------- | -------- | ------------------------------- |
| **Ledger Transactions**         | 0        | 2 hours     | P0       | Financial - no transaction loss |
| **Wallet Balances**             | 0        | 2 hours     | P0       | Derived from ledger, critical   |
| **User Data** (auth, profile)   | 1 hour   | 4 hours     | P0       | Required for login              |
| **Projects**                    | 1 hour   | 4 hours     | P0       | Core entity                     |
| **Subscriptions**               | 1 hour   | 4 hours     | P0       | Billing critical                |
| **Brain Data** (facts, signals) | 1 hour   | 6 hours     | P1       | Important but regenerable       |
| **Mission Instances**           | 1 hour   | 6 hours     | P1       | Can be retried                  |
| **Calendar Items**              | 4 hours  | 8 hours     | P2       | Can be recreated                |
| **Scrape Data**                 | 24 hours | 12 hours    | P2       | Can be re-scraped               |
| **Event Log**                   | 24 hours | Best effort | P3       | Historical, not critical        |
| **Secrets & Config**            | 0        | 1 hour      | P0       | Required for operation          |

---

## Backup Strategy

### Supabase Built-in Backups (Pro Plan)

- **Frequency:** Daily automated backups
- **Retention:** 7 days (Pro), 30 days (Team+)
- **PITR:** Point-in-time recovery for last 7 days
- **Location:** Supabase-managed, same region

### Custom Backups (Additional Safety)

**Critical Tables:** Every 6 hours to S3

```bash
# Run backup
./scripts/backup/backup-critical-tables.sh

# Tables included:
# - core_ledger
# - core_wallets
# - users
# - projects
# - core_subscriptions
# - core_payments
```

**Retention Policy:**

- Hourly backups: 48 hours
- Daily backups: 30 days
- Weekly backups: 1 year

---

## Backup Scripts

### 1. Backup Critical Tables

```bash
# Environment variables required:
export DATABASE_URL="postgresql://..."
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export S3_BACKUP_BUCKET="glimad-backups"

# Run backup
./scripts/backup/backup-critical-tables.sh
```

### 2. Restore Single Table

```bash
# Restore from local file
./scripts/backup/restore-table.sh core_wallets /tmp/backup.dump

# Restore from S3
./scripts/backup/restore-table.sh users s3://glimad-backups/critical/2024/01/15/backup.dump
```

### 3. Full Database Restore

```bash
# ⚠️ WARNING: This replaces ALL data!
./scripts/backup/restore-full-db.sh 2024-01-15
```

---

## Disaster Recovery Scenarios

### Scenario 1: Database Corruption

**Symptoms:**

- Queries failing with "corrupted data" errors
- Inconsistent reads

**Recovery:**

1. Enable maintenance mode
2. Assess which tables are corrupted
3. Restore from Supabase PITR or custom backup
4. Run integrity checks
5. Disable maintenance mode

**RTO:** 2-4 hours | **RPO:** 1 hour

### Scenario 2: Accidental Data Deletion

**Example:** `DELETE FROM users;` accidentally executed

**Recovery:**

1. If still in same session: `ROLLBACK`
2. If committed: Restore from PITR to timestamp before DELETE
3. Verify row counts
4. Investigate cause

**RTO:** 1-2 hours | **RPO:** <1 hour

### Scenario 3: Complete Database Loss

**Example:** AWS region down, Supabase unreachable

**Recovery:**

1. Declare P0 incident
2. Check AWS/Supabase status pages
3. If prolonged (>1h):
   - Restore from custom backups to new Supabase instance
   - Update DNS/env vars
4. Verify critical tables
5. Resume traffic

**RTO:** 4-6 hours | **RPO:** 6 hours

### Scenario 4: Secrets Compromised

**Example:** API keys leaked on GitHub

**Recovery:**

1. Rotate ALL secrets immediately
2. Verify no unauthorized access
3. Update all services with new keys
4. Monitor for 48 hours

**RTO:** 1 hour

---

## Maintenance Mode

### Enable Maintenance Mode

```typescript
import { getBackupService } from "@/lib/backup";

const service = getBackupService();

// Enable with expected duration
await service.enableMaintenanceMode(
  "Database restoration",
  "We are performing scheduled maintenance. Back shortly!",
  30, // Expected duration in minutes
  "admin@glimad.com",
);
```

### Disable Maintenance Mode

```typescript
await service.disableMaintenanceMode("admin@glimad.com");
```

### Check Maintenance Mode

```typescript
import { isMaintenanceMode } from "@/lib/backup";

if (await isMaintenanceMode()) {
  // Show maintenance page
}
```

---

## Monitoring & Alerts

### Check Overdue Backups

```typescript
import { getBackupService } from "@/lib/backup";

const service = getBackupService();
const overdue = await service.checkBackupOverdue();

// Get critical overdue only
const critical = await service.getCriticalOverdueBackups();
```

### Health Check

```typescript
import { checkBackupsHealth } from "@/lib/backup";

const health = await checkBackupsHealth();
// { healthy: true, overdueCount: 0, criticalOverdueCount: 0 }
```

### SQL Query for Monitoring

```sql
-- Check last backup per target
SELECT
  target,
  MAX(completed_at) as last_backup,
  NOW() - MAX(completed_at) as time_since
FROM backup_log
WHERE status = 'completed'
GROUP BY target;
```

---

## Monthly Backup Drill

**Objective:** Verify backups are restorable

**Process:**

1. Create test Supabase instance
2. Restore latest backup
3. Run verification queries:

```sql
-- Verify row counts
SELECT 'users' as t, COUNT(*) FROM users
UNION ALL SELECT 'projects', COUNT(*) FROM projects
UNION ALL SELECT 'core_ledger', COUNT(*) FROM core_ledger;

-- Check referential integrity
SELECT COUNT(*) as orphaned_projects
FROM projects p
LEFT JOIN users u ON p.user_id = u.id
WHERE u.id IS NULL;
```

4. Document results
5. Destroy test instance

**Frequency:** First Monday of each month

---

## Database Tables

### backup_log

Tracks all backup operations.

| Column       | Type        | Description                                     |
| ------------ | ----------- | ----------------------------------------------- |
| id           | UUID        | Primary key                                     |
| backup_type  | TEXT        | 'full', 'incremental', 'table', 'pitr'          |
| target       | TEXT        | 'database', 'storage', 'n8n', 'secrets'         |
| tables       | TEXT[]      | Tables included                                 |
| status       | TEXT        | 'pending', 'in_progress', 'completed', 'failed' |
| size_bytes   | BIGINT      | Backup file size                                |
| location     | TEXT        | S3 URI or local path                            |
| started_at   | TIMESTAMPTZ | Start time                                      |
| completed_at | TIMESTAMPTZ | Completion time                                 |
| verified_at  | TIMESTAMPTZ | When backup was tested                          |

### restoration_log

Tracks database restoration operations.

| Column           | Type   | Description                |
| ---------------- | ------ | -------------------------- |
| id               | UUID   | Primary key                |
| backup_id        | UUID   | Reference to backup used   |
| restoration_type | TEXT   | 'full', 'table', 'pitr'    |
| target_tables    | TEXT[] | Tables restored            |
| rows_restored    | BIGINT | Number of rows restored    |
| initiated_by     | TEXT   | User who triggered         |
| reason           | TEXT   | Why restoration was needed |

### rpo_rto_targets

Configuration of RPO/RTO targets per data type.

### maintenance_mode

Single-row table for maintenance mode state.

---

## Estimated Costs

| Item                            | Cost       |
| ------------------------------- | ---------- |
| Supabase Pro (includes backups) | $25/month  |
| S3 Custom Backups (~600 GB)     | ~$14/month |
| **Total**                       | ~$40/month |

---

## API Reference

### BackupService Methods

```typescript
// Backup operations
startBackup(params: CreateBackupParams): Promise<string>
completeBackup(params: CompleteBackupParams): Promise<void>
getBackupHistory(options?): Promise<BackupLogEntry[]>
getLatestBackup(target?): Promise<BackupLogEntry | null>
verifyBackup(backupId, verifiedBy): Promise<BackupLogEntry>

// Restoration
startRestoration(params): Promise<RestorationLogEntry>
completeRestoration(id, status, rowsRestored?, error?): Promise<void>
getRestorationHistory(limit?): Promise<RestorationLogEntry[]>

// RPO/RTO
getRpoRtoTargets(): Promise<RpoRtoTarget[]>
checkBackupOverdue(): Promise<BackupOverdueStatus[]>
getCriticalOverdueBackups(): Promise<BackupOverdueStatus[]>

// Maintenance
getMaintenanceMode(): Promise<MaintenanceMode>
setMaintenanceMode(params): Promise<void>
enableMaintenanceMode(reason, message, duration?, by?): Promise<void>
disableMaintenanceMode(by?): Promise<void>

// Database info
getDatabaseSizeInfo(): Promise<DatabaseSizeInfo>
getCriticalTableCounts(): Promise<Record<string, number>>
runIntegrityChecks(): Promise<IntegrityCheckResult[]>
```

---

## Contact

For backup-related incidents:

- **Slack:** #incidents
- **Email:** ops@glimad.com
- **On-call rotation:** See PagerDuty
