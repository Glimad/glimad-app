/**
 * lib/missions/steps/brain-update.ts
 * Brain Update Step Executor
 * Brief 10 Implementation
 */

import { StepExecutionContext, CoreOutput } from "../types";
import { writeFact, appendSignal } from "@/lib/brain";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Execute brain_update step: Write facts and signals to project brain
 */
export async function executeBrainUpdate(
  context: StepExecutionContext,
): Promise<CoreOutput | null> {
  const admin = createAdminClient();
  const step = context.step;
  const config = step.config as Record<string, unknown>;

  const brainCtx = (context.brainContext || {}) as Record<string, unknown>;
  const llmOutput = (brainCtx["__llm_output"] as Record<string, unknown>) || {};

  // Write full LLM output as single fact if configured
  const fullOutputKey = config.full_output_key as string | undefined;
  if (fullOutputKey) {
    await writeFact(
      admin,
      context.projectId,
      fullOutputKey,
      llmOutput,
      "mission",
    );
  }

  // Write individual facts
  const factKeys = (config.facts as Array<string>) || [];
  for (const factKey of factKeys) {
    // Prefer user-edited value from context, fall back to LLM output
    const value = brainCtx[factKey] ?? llmOutput[factKey];
    if (value !== undefined) {
      await writeFact(admin, context.projectId, factKey, value, "mission");
    }
  }

  // Append signals
  const signalKeys = (config.signals as Array<string>) || [];
  for (const signalKey of signalKeys) {
    await appendSignal(
      admin,
      context.projectId,
      signalKey,
      { source: "mission", template: context.templateCode },
      "mission",
    );
  }

  return null;
}
