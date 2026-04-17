/**
 * lib/cost/types.ts
 * Brief 29: Developer Cost Tracking & Validation
 */

// ============================================================================
// OPERATION TYPES
// ============================================================================

/** All trackable operation types — matches finance model categories */
export const OPERATION_TYPE = {
  // LLM
  LLM_LIGHT: "llm_light",
  LLM_POWER: "llm_power",
  LLM_MISSION_DISCOVERY: "llm_mission_discovery",
  LLM_MISSION_DIAGNOSTIC: "llm_mission_diagnostic",
  LLM_DAILY_PULSE: "llm_daily_pulse",

  // Scraping
  SCRAPE_LIGHT_REFRESH: "scrape_light_refresh",
  SCRAPE_BOOTSTRAP: "scrape_bootstrap",
  SCRAPE_VIRAL_PULL: "scrape_viral_pull",

  // Content Lab
  CONTENT_LAB_BATCH_7D: "content_lab_batch_7d",
  CONTENT_LAB_VIRAL_VARIANT: "content_lab_viral_variant",
  CONTENT_LAB_HOOK_LIBRARY: "content_lab_hook_library",

  // Email / notifications
  EMAIL_WELCOME: "email_welcome",
  EMAIL_WEEKLY_DIGEST: "email_weekly_digest",
  EMAIL_CRITICAL_ALERT: "email_critical_alert",

  // Infrastructure (for manual cost attribution)
  INFRA_STORAGE: "infra_storage",
  INFRA_BANDWIDTH: "infra_bandwidth",
  INFRA_DB_QUERIES: "infra_db_queries",
  INFRA_EDGE_COMPUTE: "infra_edge_compute",
} as const;

export type OperationType =
  (typeof OPERATION_TYPE)[keyof typeof OPERATION_TYPE];

// ============================================================================
// PROVIDERS
// ============================================================================

export const PROVIDER = {
  ANTHROPIC: "anthropic",
  OPENAI: "openai",
  APIFY: "apify",
  RESEND: "resend",
  SUPABASE: "supabase",
  VERCEL: "vercel",
  N8N: "n8n",
} as const;

export type Provider = (typeof PROVIDER)[keyof typeof PROVIDER];

// ============================================================================
// COST LOG ROW
// ============================================================================

/** Matches `dev_cost_log` table schema */
export interface CostLogRow {
  id: string;
  operation_type: string;
  project_id: string | null;
  user_id: string | null;
  plan_code: string | null;
  cost_eur: number;
  credits_consumed: number | null;
  cost_per_credit_eur: number | null;
  duration_ms: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_total: number | null;
  retry_count: number;
  provider: string | null;
  model: string | null;
  correlation_id: string | null;
  job_id: string | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

/** Input to `logCost()` — subset of CostLogRow required for insert */
export interface LogCostInput {
  operation_type: OperationType | string;
  cost_eur: number;
  project_id?: string | null;
  user_id?: string | null;
  plan_code?: string | null;
  credits_consumed?: number | null;
  cost_per_credit_eur?: number | null;
  duration_ms?: number | null;
  tokens_input?: number | null;
  tokens_output?: number | null;
  retry_count?: number;
  provider?: Provider | string | null;
  model?: string | null;
  correlation_id?: string | null;
  job_id?: string | null;
  success?: boolean;
  error_message?: string | null;
}

// ============================================================================
// ANALYTICS RETURN TYPES
// ============================================================================

export interface OperationCostStats {
  operation_type: string;
  total_ops: number;
  avg_cost_eur: number;
  min_cost_eur: number;
  max_cost_eur: number;
  total_cost_eur: number;
  stddev_cost: number | null;
  avg_duration_ms: number | null;
  avg_tokens_total: number | null;
}

export interface PlanCogsSummary {
  plan_code: string | null;
  total_users: number;
  total_ops: number;
  total_cost_eur: number;
  avg_cost_per_user_eur: number;
  avg_cost_per_op_eur: number;
}

export interface RetryRateStats {
  operation_type: string;
  total_jobs: number;
  retried_jobs: number;
  retry_rate_pct: number;
  avg_retries: number;
}

export interface CostSummary {
  period_days: number;
  generated_at: string;
  total_cost_eur: number;
  total_ops: number;
  success_rate_pct: number;
  top_operations: OperationCostStats[];
  by_plan: PlanCogsSummary[];
  retry_rates: RetryRateStats[];
  /** Finance model alert thresholds */
  alerts: CostAlert[];
}

export interface CostAlert {
  level: "ok" | "warn" | "critical";
  message: string;
  /** Finance model threshold that triggered the alert */
  threshold_eur?: number;
  /** Actual measured value */
  actual_eur?: number;
}
