/**
 * lib/operations/index.ts
 * Brief 16: Plano Operativo — Job Queue, Idempotency, Observability
 *
 * Provides:
 *  - Lab job queue (enqueue, execute, retry with backoff)
 *  - Idempotency helpers (key generation, check/upsert)
 *  - Correlation ID tracing
 *  - Brain update patch application
 *  - Event log with correlation IDs
 *  - Output payload validation
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { writeFact, appendSignal, createSnapshot } from "@/lib/brain";

type AdminClient = ReturnType<typeof createAdminClient>;

// ============================================================================
// TYPES
// ============================================================================

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "retrying";

export type EventSource = "ui" | "edge" | "n8n" | "cron";

export interface LabJob {
  job_id: string;
  project_id: string;
  mission_instance_id: string | null;
  lab_key: string;
  action_key: string;
  status: JobStatus;
  attempt: number;
  max_attempts: number;
  run_after: string | null;
  request_json: Record<string, unknown>;
  response_json: Record<string, unknown> | null;
  error_json: Record<string, unknown> | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

export interface EnqueueJobInput {
  project_id: string;
  lab_key: string;
  action_key: string;
  request_json: Record<string, unknown>;
  idempotency_key: string;
  mission_instance_id?: string;
  max_attempts?: number;
}

export interface BrainPatchJson {
  facts_upsert?: Array<{
    key: string;
    value: unknown;
    confidence?: number;
    source?: string;
  }>;
  signals_append?: Array<{
    key: string;
    value: unknown;
    source?: string;
  }>;
  snapshot_create?: {
    reason?: string;
    metadata?: Record<string, unknown>;
  };
}

// ============================================================================
// CORRELATION ID
// ============================================================================

/**
 * Generate a correlation ID for end-to-end tracing.
 * Format: corr_{timestamp}_{random}
 */
export function generateCorrelationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `corr_${ts}_${rand}`;
}

// ============================================================================
// IDEMPOTENCY
// ============================================================================

/**
 * Generate an idempotency key for a job.
 * Format: project_id:action_key:scope_window
 *
 * scopeWindow examples:
 *  - "daily"   → "2026-01-08"
 *  - "weekly"  → "2026w02"
 *  - "monthly" → "2026-01"
 *  - "once"    → "once" (no time window)
 */
export function generateIdempotencyKey(
  projectId: string,
  actionKey: string,
  scopeWindow: "daily" | "weekly" | "monthly" | "once" | string = "daily",
): string {
  const now = new Date();
  let windowToken: string;

  if (scopeWindow === "once") {
    windowToken = "once";
  } else if (scopeWindow === "daily") {
    windowToken = now.toISOString().slice(0, 10); // YYYY-MM-DD
  } else if (scopeWindow === "weekly") {
    const year = now.getUTCFullYear();
    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const weekNum = Math.ceil(
      ((now.getTime() - startOfYear.getTime()) / 86400000 +
        startOfYear.getUTCDay() +
        1) /
        7,
    );
    windowToken = `${year}w${String(weekNum).padStart(2, "0")}`;
  } else if (scopeWindow === "monthly") {
    windowToken = now.toISOString().slice(0, 7); // YYYY-MM
  } else {
    windowToken = scopeWindow;
  }

  return `${projectId}:${actionKey}:${windowToken}`;
}

// ============================================================================
// JOB QUEUE
// ============================================================================

/**
 * Enqueue a lab job (idempotent).
 * Returns { job_id, status } — may return existing job if idempotency_key matches.
 */
export async function enqueueJob(
  admin: AdminClient,
  input: EnqueueJobInput,
): Promise<{ job_id: string; status: JobStatus; created: boolean }> {
  // Check idempotency
  const { data: existing } = await admin
    .from("core_lab_jobs")
    .select("job_id, status")
    .eq("idempotency_key", input.idempotency_key)
    .single();

  if (existing) {
    const status = existing.status as JobStatus;
    // If succeeded → return existing (no duplicate)
    if (status === "succeeded") {
      return { job_id: existing.job_id as string, status, created: false };
    }
    // If running → return in_progress
    if (status === "running") {
      return { job_id: existing.job_id as string, status, created: false };
    }
    // If failed and can retry → requeue
    if (status === "failed") {
      await admin
        .from("core_lab_jobs")
        .update({
          status: "queued",
          run_after: null,
          updated_at: new Date().toISOString(),
        })
        .eq("job_id", existing.job_id);
      return {
        job_id: existing.job_id as string,
        status: "queued",
        created: false,
      };
    }
    return { job_id: existing.job_id as string, status, created: false };
  }

  const { data, error } = await admin
    .from("core_lab_jobs")
    .insert({
      project_id: input.project_id,
      lab_key: input.lab_key,
      action_key: input.action_key,
      status: "queued",
      attempt: 0,
      max_attempts: input.max_attempts ?? 3,
      run_after: null,
      request_json: input.request_json,
      idempotency_key: input.idempotency_key,
      mission_instance_id: input.mission_instance_id ?? null,
    })
    .select("job_id")
    .single();

  if (error || !data)
    throw new Error(`Failed to enqueue job: ${error?.message}`);
  return { job_id: data.job_id as string, status: "queued", created: true };
}

/**
 * Get a job by ID.
 */
export async function getJob(
  admin: AdminClient,
  jobId: string,
): Promise<LabJob | null> {
  const { data } = await admin
    .from("core_lab_jobs")
    .select("*")
    .eq("job_id", jobId)
    .single();
  return data as LabJob | null;
}

/**
 * List queued jobs ready to run (for the job runner cron).
 */
export async function getQueuedJobs(
  admin: AdminClient,
  limit = 10,
): Promise<LabJob[]> {
  const now = new Date().toISOString();
  const { data } = await admin
    .from("core_lab_jobs")
    .select("*")
    .in("status", ["queued", "retrying"])
    .or(`run_after.is.null,run_after.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as LabJob[];
}

/**
 * Mark a job as running (claim it for execution).
 * Returns false if job was already claimed by another process.
 */
export async function claimJob(
  admin: AdminClient,
  jobId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("core_lab_jobs")
    .update({
      status: "running",
      updated_at: new Date().toISOString(),
    })
    .eq("job_id", jobId)
    .in("status", ["queued", "retrying"])
    .select("job_id")
    .single();
  return !!data;
}

/**
 * Mark a job as succeeded.
 */
export async function succeedJob(
  admin: AdminClient,
  jobId: string,
  responseJson: Record<string, unknown>,
): Promise<void> {
  await admin
    .from("core_lab_jobs")
    .update({
      status: "succeeded",
      response_json: responseJson,
      updated_at: new Date().toISOString(),
    })
    .eq("job_id", jobId);
}

/**
 * Mark a job as failed or schedule retry with exponential backoff.
 * Backoff: attempt 1 → 5min, attempt 2 → 15min, attempt 3+ → failed.
 */
export async function failJob(
  admin: AdminClient,
  jobId: string,
  errorJson: Record<string, unknown>,
): Promise<void> {
  const job = await getJob(admin, jobId);
  if (!job) return;

  const newAttempt = job.attempt + 1;
  const BACKOFF_MINUTES = [5, 15, 60];

  if (newAttempt < job.max_attempts) {
    const backoffMin =
      BACKOFF_MINUTES[Math.min(newAttempt - 1, BACKOFF_MINUTES.length - 1)];
    const runAfter = new Date(
      Date.now() + backoffMin * 60 * 1000,
    ).toISOString();
    await admin
      .from("core_lab_jobs")
      .update({
        status: "retrying",
        attempt: newAttempt,
        run_after: runAfter,
        error_json: errorJson,
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", jobId);
  } else {
    await admin
      .from("core_lab_jobs")
      .update({
        status: "failed",
        attempt: newAttempt,
        error_json: errorJson,
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", jobId);
  }
}

// ============================================================================
// BRAIN UPDATE PATCHES
// ============================================================================

/**
 * Apply a brain update patch (facts_upsert + signals_append + snapshot_create).
 * Records the patch in core_brain_updates for audit trail.
 */
export async function applyBrainPatch(
  admin: AdminClient,
  projectId: string,
  patch: BrainPatchJson,
  idempotencyKey: string,
  missionInstanceId?: string,
  jobId?: string,
): Promise<void> {
  // Idempotency check
  const { data: existing } = await admin
    .from("core_brain_updates")
    .select("brain_update_id, applied")
    .eq("idempotency_key", idempotencyKey)
    .single();

  if (existing?.applied) return; // Already applied

  // Apply facts
  if (patch.facts_upsert?.length) {
    for (const fact of patch.facts_upsert) {
      await writeFact(
        admin,
        projectId,
        fact.key,
        fact.value,
        fact.source ?? "operation",
      );
    }
  }

  // Append signals
  if (patch.signals_append?.length) {
    for (const signal of patch.signals_append) {
      await appendSignal(
        admin,
        projectId,
        signal.key,
        signal.value,
        signal.source ?? "operation",
      );
    }
  }

  // Create snapshot
  if (patch.snapshot_create) {
    const facts = await (
      await import("@/lib/brain")
    ).readAllFacts(admin, projectId);
    await createSnapshot(
      admin,
      projectId,
      patch.snapshot_create.reason ?? "operation_patch",
      {
        phase: (facts["current_phase"] as string) ?? "F0",
        facts,
      },
    );
  }

  // Record the update (upsert)
  await admin.from("core_brain_updates").upsert(
    {
      project_id: projectId,
      update_type: "facts_upsert",
      patch_json: patch,
      applied: true,
      applied_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
      mission_instance_id: missionInstanceId ?? null,
      job_id: jobId ?? null,
    },
    { onConflict: "idempotency_key" },
  );
}

// ============================================================================
// EVENT LOG
// ============================================================================

/**
 * Log an operational event with a correlation ID.
 * Fire-and-forget — never throws.
 */
export async function logEvent(
  admin: AdminClient,
  eventName: string,
  source: EventSource,
  correlationId: string,
  payload: Record<string, unknown> = {},
  opts?: { project_id?: string; user_id?: string },
): Promise<void> {
  try {
    await admin.from("event_log").insert({
      event_type: eventName,
      event_data: {
        source,
        correlation_id: correlationId,
        ...payload,
      },
      project_id: opts?.project_id ?? null,
    });
  } catch {
    // Observability events are non-critical — swallow errors
  }
}

// ============================================================================
// OUTPUT PAYLOAD VALIDATION
// ============================================================================

export type OutputType =
  | "content_piece"
  | "strategy_report"
  | "scrape_snapshot"
  | "analysis"
  | "asset_ref";

const REQUIRED_FIELDS: Record<OutputType, string[]> = {
  content_piece: ["platform", "hook"],
  strategy_report: ["summary", "top_priorities"],
  scrape_snapshot: ["platform", "metrics"],
  analysis: ["hypothesis"],
  asset_ref: ["calendar_item"],
};

/**
 * Validate an output payload against its type contract.
 */
export function validateOutputPayload(
  outputType: OutputType,
  payload: Record<string, unknown>,
): { valid: boolean; errors: string[] } {
  const required = REQUIRED_FIELDS[outputType] ?? [];
  const errors: string[] = [];

  for (const field of required) {
    if (payload[field] === undefined || payload[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Save a validated output to core_outputs.
 */
export async function saveOutput(
  admin: AdminClient,
  projectId: string,
  outputType: OutputType,
  payloadJson: Record<string, unknown>,
  opts?: {
    mission_instance_id?: string;
    job_id?: string;
    title?: string;
    schema_version?: number;
  },
): Promise<string> {
  const validation = validateOutputPayload(outputType, payloadJson);
  if (!validation.valid) {
    // Save with validation warnings rather than throwing
    payloadJson = { ...payloadJson, _validation_warnings: validation.errors };
  }

  const { data, error } = await admin
    .from("core_outputs")
    .insert({
      project_id: projectId,
      output_type: outputType,
      schema_version: opts?.schema_version ?? 1,
      title: opts?.title ?? null,
      payload_json: payloadJson,
      mission_instance_id: opts?.mission_instance_id ?? null,
      job_id: opts?.job_id ?? null,
      visibility: "user",
    })
    .select("id")
    .single();

  if (error || !data)
    throw new Error(`Failed to save output: ${error?.message}`);
  return data.id as string;
}

// ============================================================================
// JOB RUNNER (executes a single queued job)
// ============================================================================

export type JobExecutor = (
  admin: AdminClient,
  job: LabJob,
  correlationId: string,
) => Promise<Record<string, unknown>>;

/**
 * Execute a single queued job using the provided executor map.
 * Handles claiming, success, failure, retry, and event logging.
 */
export async function executeJob(
  admin: AdminClient,
  jobId: string,
  executors: Record<string, JobExecutor>,
): Promise<{ success: boolean; correlationId: string }> {
  const correlationId = generateCorrelationId();
  const job = await getJob(admin, jobId);

  if (!job) {
    return { success: false, correlationId };
  }

  // Claim the job (prevents double-execution)
  const claimed = await claimJob(admin, jobId);
  if (!claimed) {
    return { success: false, correlationId };
  }

  await logEvent(
    admin,
    "job_started",
    "edge",
    correlationId,
    {
      job_id: jobId,
      action_key: job.action_key,
      attempt: job.attempt + 1,
    },
    { project_id: job.project_id },
  );

  const executor = executors[job.action_key];
  if (!executor) {
    await failJob(admin, jobId, {
      error: `No executor for action_key: ${job.action_key}`,
    });
    await logEvent(
      admin,
      "job_failed",
      "edge",
      correlationId,
      {
        job_id: jobId,
        error: `No executor for action_key: ${job.action_key}`,
      },
      { project_id: job.project_id },
    );
    return { success: false, correlationId };
  }

  try {
    const response = await executor(admin, job, correlationId);
    await succeedJob(admin, jobId, response);
    await logEvent(
      admin,
      "job_succeeded",
      "edge",
      correlationId,
      {
        job_id: jobId,
        action_key: job.action_key,
      },
      { project_id: job.project_id },
    );
    return { success: true, correlationId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await failJob(admin, jobId, { error: errorMessage });
    await logEvent(
      admin,
      "job_failed",
      "edge",
      correlationId,
      {
        job_id: jobId,
        action_key: job.action_key,
        error: errorMessage,
      },
      { project_id: job.project_id },
    );
    return { success: false, correlationId };
  }
}

// Re-export helpers
export { generateCorrelationId as newCorrelationId };
