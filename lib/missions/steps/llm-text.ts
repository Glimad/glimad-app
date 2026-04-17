/**
 * lib/missions/steps/llm-text.ts
 * LLM Text Step Executor
 * Brief 10 Implementation
 */

import { StepExecutionContext, CoreOutput } from "../types";
import Anthropic from "@anthropic-ai/sdk";
import { buildPrompt, type PromptKey } from "../prompts";
import { PROMPT_SCHEMAS } from "../schemas";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

/**
 * Execute llm_text step: Call LLM with prompt from brain context
 */
export async function executeLLMText(
  context: StepExecutionContext,
  locale?: string,
): Promise<CoreOutput | null> {
  const step = context.step;
  const config = step.config as Record<string, unknown>;

  const promptKey = (config.prompt_key as PromptKey) || "default";
  const modelConfig = (config.model as string) || "haiku";

  // Resolve model name
  const model = modelConfig.startsWith("claude-")
    ? modelConfig
    : modelConfig === "sonnet"
      ? process.env.ANTHROPIC_MODEL_SONNET || "claude-3-5-sonnet-20241022"
      : process.env.ANTHROPIC_MODEL_HAIKU || "claude-3-5-haiku-20241022";

  const maxTokens =
    model.includes("sonnet") || model.includes("opus") ? 2048 : 1024;

  // Build prompt from context
  const prompt = buildPrompt(
    promptKey,
    (context.brainContext || {}) as Record<string, unknown>,
    locale,
  );

  // Get schema for validation
  const schema = PROMPT_SCHEMAS[promptKey];

  // Call LLM with retry
  let result: Record<string, unknown>;
  try {
    result = await attemptLlmCall(model, maxTokens, prompt, schema);
  } catch {
    // Retry once
    result = await attemptLlmCall(model, maxTokens, prompt, schema);
  }

  // Update brain context with result
  if (context.brainContext) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (context.brainContext as any)["__llm_output"] = result;
  }

  return null;
}

/**
 * Make LLM call and validate output
 */
async function attemptLlmCall(
  model: string,
  maxTokens: number,
  prompt: string,
  schema: unknown,
): Promise<Record<string, unknown>> {
  const message = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  // Extract text from response
  const rawText =
    (
      message.content.find((c) => c.type === "text") as
        | { type: "text"; text: string }
        | undefined
    )?.text ?? "";

  // Parse JSON from response
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

  // Validate with schema
  if (schema && typeof schema === "object" && "parse" in schema) {
    (schema as { parse: (obj: unknown) => Record<string, unknown> }).parse(
      parsed,
    );
  }

  return parsed as Record<string, unknown>;
}
