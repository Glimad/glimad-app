/**
 * lib/missions/steps/brain-read.ts
 * Brain Read Step Executor
 * Brief 10 Implementation
 */

import { StepExecutionContext } from "../types";
import { readAllFacts, readSignals } from "@/lib/brain";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Execute brain_read step: Read facts and signals from project brain
 */
export async function executeBrainRead(
  context: StepExecutionContext,
): Promise<null> {
  const admin = createAdminClient();
  const step = context.step;
  const config = step.config as Record<string, unknown>;

  // Read facts from brain
  const facts = await readAllFacts(admin, context.projectId);

  // Build result object with requested facts
  const result: Record<string, unknown> = {};

  // Direct fact keys
  const factKeys = (config.facts as Array<string>) || [];
  for (const key of factKeys) {
    result[key] = facts[key] ?? null;
  }

  // Fact extraction with optional field drilling and array wrapping
  const factExtract =
    (config.fact_extract as Record<string, Record<string, unknown>>) || {};
  for (const [canonKey, config] of Object.entries(factExtract)) {
    const val = facts[canonKey];
    let extracted: unknown = val ?? null;

    const field = config.field as string | undefined;
    if (field && val !== null && val !== undefined && typeof val === "object") {
      extracted = (val as Record<string, unknown>)[field] ?? null;
    }

    const asArray = config.as_array as boolean | undefined;
    const asKey = config.as as string;
    result[asKey] = asArray
      ? extracted != null
        ? [extracted]
        : []
      : extracted;
  }

  // Read signals if configured
  const signalsHours = (config.signals_hours as number) || 0;
  if (signalsHours > 0) {
    const signals = await readSignals(admin, context.projectId, signalsHours);
    result["__signals"] = signals;
  }

  // Update brain context in memory (caller will use this)
  if (context.brainContext) {
    Object.assign(context.brainContext, result);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context.brainContext = result as any;
  }

  return null;
}
