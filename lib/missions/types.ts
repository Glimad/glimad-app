/**
 * lib/missions/types.ts
 * Mission Template & Runner Types
 * Brief 10 Implementation
 *
 * Defines all types for mission execution, templates, and state management
 */

// ============================================================================
// MISSION TEMPLATE TYPES
// ============================================================================

export type MissionType =
  | "discovery"
  | "planning"
  | "execution"
  | "analysis"
  | "rescue";
export type StepType =
  | "brain_read"
  | "llm_text"
  | "premium_action"
  | "external_webhook"
  | "user_input"
  | "write_outputs"
  | "brain_update"
  | "snapshot"
  | "finalize";

export type CreditType = "allowance" | "premium";
export type CostProfile = "S" | "M" | "L";

export interface MissionTemplate {
  template_code: string;
  name: string;
  description: string;
  type: MissionType;
  phase_min: string | null;
  phase_max: string | null;
  credit_cost_premium: number;
  credit_cost_allowance: number;
  estimated_minutes: number;
  cooldown_hours: number;
  steps_json: TemplateStep[];
  params_schema: Record<string, unknown>;
  generation_intents: string[];
  expected_artifacts: string[];
  human_gates: string[];
  cost_profile: CostProfile;
}

export interface TemplateStep {
  step_number: number;
  step_type: StepType;
  name: string;
  config: Record<string, unknown>;
  timeout_seconds: number;
  retry_max: number;
  skip_on_failure: boolean;
  requires_credit: boolean;
  credit_type: CreditType | null;
  credit_amount: number;
}

// Update MissionTemplate to use TemplateStep instead of MissionStep
// (This type is updated above in the MissionTemplate interface definition)

// ============================================================================
// MISSION INSTANCE TYPES
// ============================================================================

export type MissionInstanceStatus =
  | "queued"
  | "running"
  | "waiting_input"
  | "waiting_job"
  | "completed"
  | "failed"
  | "canceled";

export interface MissionInstance {
  id: string;
  project_id: string;
  template_code: string;
  status: MissionInstanceStatus;
  params: Record<string, unknown>;
  current_step: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  unique_key: string;
}

export interface MissionStep {
  mission_instance_id: string;
  step_number: number;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  started_at: string | null;
  completed_at: string | null;
  data_input: Record<string, unknown> | null;
  data_output: Record<string, unknown> | null;
  error_message: string | null;
  retry_count: number;
}

export interface MissionExecution {
  id: string;
  instance_id: string;
  project_id: string;
  template_code: string;
  status: "started" | "completed" | "failed";
  result: Record<string, unknown>;
  error: string | null;
  duration_ms: number;
  created_at: string;
}

// ============================================================================
// CREDIT & RESERVATION TYPES
// ============================================================================

export interface CreditReservation {
  id: string;
  project_id: string;
  allowance_reserved: number;
  premium_reserved: number;
  allowance_spent: number;
  premium_spent: number;
  ref_type: string;
  ref_id: string;
  idempotency_key: string;
  status: "active" | "completed" | "released";
  created_at: string;
}

export interface CreditSpend {
  reservation_id: string;
  amount: number;
  type: CreditType;
  step_ref: string;
}

// ============================================================================
// EXECUTION CONTEXT TYPES
// ============================================================================

export interface BrainContext {
  facts: Record<string, unknown>[];
  signals: Record<string, unknown>[];
  snapshots?: Record<string, unknown>[];
}

export interface StepExecutionContext {
  instanceId: string;
  projectId: string;
  templateCode: string;
  step: TemplateStep;
  params: Record<string, unknown>;
  brainContext: BrainContext | null;
  reservation: CreditReservation;
}

export interface StepResult {
  data: Record<string, unknown>;
  async?: boolean;
  tokens_used?: number;
}

// ============================================================================
// OUTPUT & VALIDATION TYPES
// ============================================================================

export interface CoreOutput {
  id: string;
  mission_instance_id: string;
  project_id: string;
  template_code: string;
  output_type: string;
  content: Record<string, unknown>;
  artifact_count: number;
  created_at: string;
}

export interface CoreAsset {
  id: string;
  core_output_id: string;
  project_id: string;
  asset_type: "image" | "video" | "text" | "document";
  url: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

// ============================================================================
// RUNNER & ORCHESTRATION TYPES
// ============================================================================

export interface RunnerConfig {
  max_concurrent_instances: number;
  step_timeout_ms: number;
  max_retries: number;
  credit_buffer: number;
}

export interface StepExecutor {
  (context: StepExecutionContext): Promise<StepResult>;
}

export type StepExecutorMap = Record<StepType, StepExecutor>;

// ============================================================================
// ERROR TYPES
// ============================================================================

export class MissionError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MissionError";
  }
}

export const MissionErrorCodes = {
  TEMPLATE_NOT_FOUND: "TEMPLATE_NOT_FOUND",
  INSUFFICIENT_CREDITS: "INSUFFICIENT_CREDITS",
  INVALID_PARAMS: "INVALID_PARAMS",
  STEP_TIMEOUT: "STEP_TIMEOUT",
  STEP_FAILED: "STEP_FAILED",
  OUTPUT_VALIDATION_FAILED: "OUTPUT_VALIDATION_FAILED",
  MISSION_CANCELED: "MISSION_CANCELED",
  IDEMPOTENCY_VIOLATION: "IDEMPOTENCY_VIOLATION",
} as const;

// Export commonly-used error codes for convenience
export const {
  TEMPLATE_NOT_FOUND,
  INSUFFICIENT_CREDITS,
  INVALID_PARAMS,
  STEP_TIMEOUT,
  STEP_FAILED,
  OUTPUT_VALIDATION_FAILED,
  MISSION_CANCELED,
  IDEMPOTENCY_VIOLATION,
} = MissionErrorCodes;
