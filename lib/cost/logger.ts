/**
 * lib/cost/logger.ts
 * Brief 29: Developer Cost Tracking & Validation
 *
 * Functions for recording per-operation costs into `dev_cost_log`.
 * Call these from API routes, n8n webhook handlers, and cron jobs
 * to build up a real COGS dataset for finance validation.
 *
 * Best-effort: log failures are caught and console-warned without
 * throwing to avoid disrupting the primary operation.
 */

import { createAdminClient } from "@/lib/supabase/admin";

import type { LogCostInput } from "./types";

// EUR per token pricing (update as rates change)
const TOKEN_RATES_EUR = {
  "claude-haiku-4-5": {
    input: 0.00000025, // €0.25 / 1M input tokens
    output: 0.00000125, // €1.25 / 1M output tokens
  },
  "claude-sonnet-4-5": {
    input: 0.000003, // €3.00 / 1M input tokens
    output: 0.000015, // €15.00 / 1M output tokens
  },
  "gpt-4o-mini": {
    input: 0.00000015, // €0.15 / 1M input tokens
    output: 0.0000006, // €0.60 / 1M output tokens
  },
  "gpt-4o": {
    input: 0.000005, // €5.00 / 1M input tokens
    output: 0.000015, // €15.00 / 1M output tokens
  },
} as const;

type KnownModel = keyof typeof TOKEN_RATES_EUR;

/**
 * Calculate EUR cost for a given model and token counts.
 * Returns null when the model is unknown (caller must provide cost_eur directly).
 */
export function calcLlmCostEur(
  model: string,
  tokensInput: number,
  tokensOutput: number,
): number | null {
  const rate = TOKEN_RATES_EUR[model as KnownModel];
  if (!rate) return null;
  return rate.input * tokensInput + rate.output * tokensOutput;
}

// ============================================================================
// CORE LOG FUNCTION
// ============================================================================

/**
 * Insert a single row into `dev_cost_log`.
 * Fire-and-forget: resolves to `true` on success, `false` on error.
 * Never throws.
 */
export async function logCost(input: LogCostInput): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("dev_cost_log").insert({
      operation_type: input.operation_type,
      cost_eur: input.cost_eur,
      project_id: input.project_id ?? null,
      user_id: input.user_id ?? null,
      plan_code: input.plan_code ?? null,
      credits_consumed: input.credits_consumed ?? null,
      cost_per_credit_eur: input.cost_per_credit_eur ?? null,
      duration_ms: input.duration_ms ?? null,
      tokens_input: input.tokens_input ?? null,
      tokens_output: input.tokens_output ?? null,
      retry_count: input.retry_count ?? 0,
      provider: input.provider ?? null,
      model: input.model ?? null,
      correlation_id: input.correlation_id ?? null,
      job_id: input.job_id ?? null,
      success: input.success ?? true,
      error_message: input.error_message ?? null,
    });
    if (error) {
      console.warn("[cost-log] insert failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[cost-log] unexpected error:", err);
    return false;
  }
}

// ============================================================================
// CONVENIENCE WRAPPERS
// ============================================================================

export interface LlmCallMeta {
  model: string;
  tokensInput: number;
  tokensOutput: number;
  durationMs?: number;
  retryCount?: number;
  projectId?: string;
  userId?: string;
  planCode?: string;
  correlationId?: string;
  success?: boolean;
  errorMessage?: string;
}

/**
 * Log the cost of a single LLM call.
 * Automatically calculates EUR cost from token counts + model rate.
 * If the model is unknown, falls back to `fallbackCostEur` (required).
 */
export async function logLlmCost(
  operationType: string,
  meta: LlmCallMeta,
  fallbackCostEur?: number,
): Promise<boolean> {
  const calculatedCost = calcLlmCostEur(
    meta.model,
    meta.tokensInput,
    meta.tokensOutput,
  );
  const costEur = calculatedCost ?? fallbackCostEur;

  if (costEur === undefined) {
    console.warn(
      `[cost-log] Unknown model "${meta.model}" and no fallbackCostEur provided — skipping log`,
    );
    return false;
  }

  const provider = meta.model.startsWith("claude")
    ? "anthropic"
    : meta.model.startsWith("gpt")
      ? "openai"
      : undefined;

  return logCost({
    operation_type: operationType,
    cost_eur: costEur,
    project_id: meta.projectId,
    user_id: meta.userId,
    plan_code: meta.planCode,
    tokens_input: meta.tokensInput,
    tokens_output: meta.tokensOutput,
    duration_ms: meta.durationMs,
    retry_count: meta.retryCount,
    provider,
    model: meta.model,
    correlation_id: meta.correlationId,
    success: meta.success,
    error_message: meta.errorMessage,
  });
}

export interface ScrapeCallMeta {
  creditsConsumed: number;
  costEur: number;
  durationMs?: number;
  retryCount?: number;
  projectId?: string;
  userId?: string;
  planCode?: string;
  correlationId?: string;
  jobId?: string;
  success?: boolean;
  errorMessage?: string;
}

/**
 * Log the cost of a scraping operation.
 * `costEur` should be derived from provider billing (e.g. Apify actor cost).
 */
export async function logScrapeCost(
  operationType: string,
  meta: ScrapeCallMeta,
): Promise<boolean> {
  const costPerCredit =
    meta.creditsConsumed > 0 ? meta.costEur / meta.creditsConsumed : null;

  return logCost({
    operation_type: operationType,
    cost_eur: meta.costEur,
    project_id: meta.projectId,
    user_id: meta.userId,
    plan_code: meta.planCode,
    credits_consumed: meta.creditsConsumed,
    cost_per_credit_eur: costPerCredit,
    duration_ms: meta.durationMs,
    retry_count: meta.retryCount,
    provider: "apify",
    correlation_id: meta.correlationId,
    job_id: meta.jobId,
    success: meta.success,
    error_message: meta.errorMessage,
  });
}

export interface JobCallMeta {
  costEur: number;
  durationMs?: number;
  retryCount?: number;
  provider?: string;
  projectId?: string;
  userId?: string;
  planCode?: string;
  correlationId?: string;
  jobId?: string;
  success?: boolean;
  errorMessage?: string;
}

/**
 * Log the cost of any generic async job (n8n workflow, edge function, etc.).
 */
export async function logJobCost(
  operationType: string,
  meta: JobCallMeta,
): Promise<boolean> {
  return logCost({
    operation_type: operationType,
    cost_eur: meta.costEur,
    project_id: meta.projectId,
    user_id: meta.userId,
    plan_code: meta.planCode,
    duration_ms: meta.durationMs,
    retry_count: meta.retryCount,
    provider: meta.provider,
    correlation_id: meta.correlationId,
    job_id: meta.jobId,
    success: meta.success,
    error_message: meta.errorMessage,
  });
}
