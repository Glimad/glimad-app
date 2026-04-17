/**
 * lib/missions/steps/user-input.ts
 * User Input Step Executor
 * Brief 10 Implementation
 */

import { StepExecutionContext, CoreOutput } from "../types";

/**
 * Execute user_input step: Pause mission and wait for user response
 * Returns special marker that tells runner to pause and expose UI
 */
export async function executeUserInput(
  context: StepExecutionContext,
): Promise<CoreOutput | null> {
  const step = context.step;
  const config = step.config as Record<string, unknown>;

  // Store user input configuration for UI to display
  if (context.brainContext) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (context.brainContext as any)["__user_input_prompt"] =
      config.user_prompt || "User response needed";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (context.brainContext as any)["__user_input_field"] =
      config.input_field || "user_response";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (context.brainContext as any)["__user_input_type"] =
      (config.input_type as string) || "text";
  }

  // Return special marker that tells runner to pause
  // In the runner, this will:
  // 1. Save mission state
  // 2. Transition to 'waiting_input' status
  // 3. Expose UI for user to respond
  // 4. On user response, resume execution
  return null;
}
