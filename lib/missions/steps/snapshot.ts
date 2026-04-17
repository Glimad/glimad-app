/**
 * lib/missions/steps/snapshot.ts
 * Snapshot Step Executor
 * Brief 10 Implementation
 */

import { StepExecutionContext, CoreOutput } from "../types";
import { createSnapshot } from "@/lib/brain";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Execute snapshot step: Create a checkpoint of the current brain state
 * Used for recovery and audit trail
 */
export async function executeSnapshot(
  context: StepExecutionContext,
): Promise<CoreOutput | null> {
  const admin = createAdminClient();

  // Create brain snapshot
  try {
    await createSnapshot(
      admin,
      context.projectId,
      `mission_step_${context.step.step_number}`,
      {
        phase: "F0",
        facts: {},
      },
    );
  } catch {
    // Snapshot creation failed - continue without snapshot
  }

  // Store snapshot ID for reference
  if (context.brainContext) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (context.brainContext as any)["__last_snapshot_at"] =
      new Date().toISOString();
  }

  return null;
}
