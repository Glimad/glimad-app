/**
 * lib/deployment/types.ts
 * Shared types for deployment checks and migration validation.
 */

export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export interface CheckResult {
  /** Stable identifier for the check (e.g. "env.core", "db.tables") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Pass / fail / warning */
  status: CheckStatus;
  /** Short message describing the result */
  message: string;
  /** Optional structured details */
  details?: Record<string, unknown>;
  /** Duration in milliseconds */
  duration_ms?: number;
}

export interface DeploymentReport {
  /** ISO timestamp of report generation */
  generated_at: string;
  /** Overall pass/fail */
  overall: CheckStatus;
  /** Count of each status */
  summary: {
    pass: number;
    warn: number;
    fail: number;
    skip: number;
  };
  /** Individual check results in execution order */
  checks: CheckResult[];
}

export interface MigrationEntry {
  /** Sequential number prefix (e.g. "001", "028") */
  number: string;
  /** Full filename (e.g. "028_rls_policies_complete.sql") */
  filename: string;
  /** Short label derived from filename */
  label: string;
}
