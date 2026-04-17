/**
 * lib/missions/steps/write-outputs.ts
 * Write Outputs Step Executor
 * Brief 10 Implementation
 */

import { StepExecutionContext, CoreOutput } from "../types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Execute write_outputs step: Persist outputs to database
 */
export async function executeWriteOutputs(
  context: StepExecutionContext,
): Promise<CoreOutput | null> {
  const admin = createAdminClient();
  const step = context.step;
  const config = step.config as Record<string, unknown>;
  const outputType = config.output_type as string;

  // Get LLM output from brain context
  const brainCtx = (context.brainContext || {}) as Record<string, unknown>;
  const llmOutput = (brainCtx["__llm_output"] as Record<string, unknown>) || {};

  // Convert LLM output to outputs based on type
  const outputs = transformToOutputs(outputType, llmOutput, context);

  // Persist each output
  const savedOutputs: CoreOutput[] = [];
  for (const output of outputs) {
    const { data: saved, error } = await admin
      .from("core_outputs")
      .insert({
        project_id: context.projectId,
        mission_instance_id: context.instanceId,
        output_type: outputType,
        format: output.format,
        content: output.content,
        artifacts_json: output.artifacts || {},
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (!error && saved) {
      savedOutputs.push(saved);
    }
  }

  // Store output IDs in brain context for reference
  if (context.brainContext) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (context.brainContext as any)["__output_ids"] = savedOutputs.map(
      (o) => o.id,
    );
  }

  return null;
}

/**
 * Transform LLM output to CoreOutput format
 */
function transformToOutputs(
  outputType: string,
  llmOutput: Record<string, unknown>,
  context: StepExecutionContext,
): Array<{
  format: string;
  content: Record<string, unknown>;
  artifacts?: Record<string, unknown>;
}> {
  const outputs: Array<{
    format: string;
    content: Record<string, unknown>;
    artifacts?: Record<string, unknown>;
  }> = [];

  switch (outputType) {
    case "content_batch": {
      // Transform posts array to individual content outputs
      const posts = Array.isArray(llmOutput["posts"])
        ? llmOutput["posts"]
        : [llmOutput];
      for (const post of posts) {
        outputs.push({
          format:
            ((post as Record<string, unknown>)["format"] as string) || "post",
          content: post as Record<string, unknown>,
          artifacts: {
            source: "llm_generated",
            template: context.templateCode,
          },
        });
      }
      break;
    }

    case "repurposed_content": {
      // Transform repurposed versions
      const versions = Array.isArray(llmOutput["versions"])
        ? llmOutput["versions"]
        : [llmOutput];
      for (const version of versions) {
        outputs.push({
          format:
            ((version as Record<string, unknown>)["format"] as string) ||
            "post",
          content: version as Record<string, unknown>,
          artifacts: {
            source: "repurposed",
            template: context.templateCode,
          },
        });
      }
      break;
    }

    case "image_assets": {
      // Transform image generations
      const images = Array.isArray(llmOutput["images"])
        ? llmOutput["images"]
        : [llmOutput];
      for (const image of images) {
        outputs.push({
          format: "image",
          content: image as Record<string, unknown>,
          artifacts: {
            source: "image_gen",
            template: context.templateCode,
          },
        });
      }
      break;
    }

    case "post_schedule": {
      // Post schedule output
      outputs.push({
        format: "schedule",
        content: llmOutput,
        artifacts: {
          source: "scheduler",
          template: context.templateCode,
        },
      });
      break;
    }

    default: {
      // Generic output
      outputs.push({
        format: "generic",
        content: llmOutput,
        artifacts: {
          source: "mission",
          template: context.templateCode,
        },
      });
    }
  }

  return outputs;
}
