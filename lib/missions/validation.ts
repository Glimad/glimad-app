/**
 * lib/missions/validation.ts
 * Output Validation Layer
 * Brief 10 Implementation
 *
 * Validates mission outputs against schemas using zod or JSON Schema
 */

import { CoreOutput, MissionError, OUTPUT_VALIDATION_FAILED } from "./types";
import { z } from "zod";

// ============================================================================
// OUTPUT SCHEMAS
// ============================================================================

/**
 * Define schemas for different output types
 */
const OUTPUT_TYPE_SCHEMAS: Record<string, z.ZodSchema> = {
  content: z
    .object({
      text: z.string().min(1),
      format: z.enum(["post", "caption", "hook", "story"]),
      platform: z.string().optional(),
      hashtags: z.array(z.string()).optional(),
      mentions: z.array(z.string()).optional(),
    })
    .strict(),

  image: z
    .object({
      url: z.string().url(),
      alt_text: z.string().optional(),
      dimensions: z
        .object({
          width: z.number().positive(),
          height: z.number().positive(),
        })
        .optional(),
    })
    .strict(),

  video: z
    .object({
      url: z.string().url(),
      duration_seconds: z.number().positive(),
      platform: z.string().optional(),
      thumbnail_url: z.string().url().optional(),
    })
    .strict(),

  schedule: z
    .object({
      posts: z.array(
        z.object({
          output_id: z.string().uuid(),
          scheduled_at: z.string().datetime(),
          platform: z.string(),
        }),
      ),
    })
    .strict(),

  report: z
    .object({
      title: z.string(),
      summary: z.string(),
      metrics: z.record(z.string(), z.number()).optional(),
      recommendations: z.array(z.string()).optional(),
    })
    .strict(),
};

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate output against its type schema
 */
export function validateOutput(output: Partial<CoreOutput>): boolean {
  const schema = OUTPUT_TYPE_SCHEMAS[output.output_type || ""];

  if (!schema) {
    throw new MissionError(
      OUTPUT_VALIDATION_FAILED,
      `No schema defined for output type: ${output.output_type}`,
    );
  }

  try {
    schema.parse(output.content);
    return true;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new MissionError(
        OUTPUT_VALIDATION_FAILED,
        `Output validation failed: ${error.message}`,
        {
          errors: error.issues,
        },
      );
    }
    throw error;
  }
}

/**
 * Validate batch of outputs
 */
export function validateOutputs(outputs: Partial<CoreOutput>[]): boolean {
  for (const output of outputs) {
    validateOutput(output);
  }
  return true;
}

/**
 * Validate output has required artifacts
 */
export function validateArtifacts(
  output: Partial<CoreOutput>,
  requiredArtifactCount: number,
): boolean {
  if ((output.artifact_count || 0) < requiredArtifactCount) {
    throw new MissionError(
      OUTPUT_VALIDATION_FAILED,
      `Expected at least ${requiredArtifactCount} artifacts, got ${output.artifact_count || 0}`,
    );
  }

  return true;
}

/**
 * Validate output format
 */
export function validateFormat(
  output: Partial<CoreOutput>,
  allowedFormats: string[],
): boolean {
  const content = (output.content as Record<string, unknown>) || {};
  const format = content["format"] as string;

  if (!allowedFormats.includes(format || "")) {
    throw new MissionError(
      OUTPUT_VALIDATION_FAILED,
      `Invalid format ${format}. Allowed: ${allowedFormats.join(", ")}`,
    );
  }

  return true;
}

/**
 * Comprehensive output validation
 */
export function validateOutputComprehensive(
  output: Partial<CoreOutput>,
  options: {
    requiredArtifactCount?: number;
    requiredFields?: string[];
  } = {},
): boolean {
  // Validate against schema
  validateOutput(output);

  // Validate artifact count
  if (options.requiredArtifactCount) {
    validateArtifacts(output, options.requiredArtifactCount);
  }

  // Validate required fields in content
  if (options.requiredFields) {
    const content = output.content || {};
    for (const field of options.requiredFields) {
      if (!(field in content)) {
        throw new MissionError(
          OUTPUT_VALIDATION_FAILED,
          `Missing required field: ${field}`,
        );
      }
    }
  }

  return true;
}

// ============================================================================
// SCHEMA REGISTRY
// ============================================================================

export const VALIDATION_RULES: Record<string, Record<string, unknown>> = {
  content_batch: {
    outputType: "content",
    requiredArtifacts: ["source", "template"],
    requiredFields: ["text", "format"],
    minOutputs: 1,
  },

  image_gen: {
    outputType: "image",
    requiredArtifacts: ["source", "template"],
    requiredFields: ["url"],
  },

  weekly_review: {
    outputType: "report",
    requiredArtifacts: ["source", "template"],
    requiredFields: ["title", "summary"],
  },

  post_schedule: {
    outputType: "schedule",
    requiredArtifacts: ["source", "template"],
    requiredFields: ["posts"],
  },
};

/**
 * Get validation rules for a mission template
 */
export function getValidationRules(
  templateCode: string,
): Record<string, unknown> | null {
  return VALIDATION_RULES[templateCode] || null;
}
