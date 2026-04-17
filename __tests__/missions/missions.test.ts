/**
 * __tests__/missions/missions.test.ts
 * Mission System Test Suite
 * Brief 10 Implementation
 */

import "../jest.globals";
import {
  MISSION_TEMPLATES,
  getTemplate,
  listTemplates,
  getTemplatesByType,
} from "@/lib/missions/templates";
import {
  validateOutput,
  validateOutputs,
  validateArtifacts,
} from "@/lib/missions/validation";
import { MissionError } from "@/lib/missions/types";

// ============================================================================
// TEMPLATE CATALOG TESTS
// ============================================================================

describe("Mission Template Catalog", () => {
  it("should have 22 templates defined", () => {
    const templates = Object.keys(MISSION_TEMPLATES);
    expect(templates).toHaveLength(22);
  });

  it("should get template by code", () => {
    const template = getTemplate("content_batch_3d");
    expect(template).toBeDefined();
    expect(template?.name).toBe("Quick Content Batch (3 days)");
    expect(template?.type).toBe("execution");
  });

  it("should return null for non-existent template", () => {
    const template = getTemplate("non_existent");
    expect(template).toBeNull();
  });

  it("should list templates by type", () => {
    const executionTemplates = getTemplatesByType("execution");
    expect(executionTemplates.length).toBeGreaterThan(0);
    executionTemplates.forEach((t) => {
      expect(t.type).toBe("execution");
    });
  });

  it("should list all templates with limit", () => {
    const templates = listTemplates();
    expect(templates.length).toBe(22);
  });

  it("should filter templates by phase", () => {
    const templates = listTemplates(undefined, "F0");
    expect(templates.length).toBeGreaterThan(0);
    templates.forEach((t) => {
      if (t.phase_min) {
        expect(t.phase_min).toBeLessThanOrEqual("F0");
      }
    });
  });

  it("should have valid credit cost for each template", () => {
    Object.values(MISSION_TEMPLATES).forEach((template) => {
      expect(template.credit_cost_allowance).toBeGreaterThanOrEqual(0);
      expect(template.credit_cost_premium).toBeGreaterThanOrEqual(0);
    });
  });

  it("should have steps for each template", () => {
    Object.values(MISSION_TEMPLATES).forEach((template) => {
      expect(template.steps_json).toBeDefined();
      expect(template.steps_json.length).toBeGreaterThan(0);
    });
  });

  it("should have valid step types", () => {
    const validStepTypes = [
      "brain_read",
      "llm_text",
      "premium_action",
      "external_webhook",
      "user_input",
      "write_outputs",
      "brain_update",
      "snapshot",
      "finalize",
    ];

    Object.values(MISSION_TEMPLATES).forEach((template) => {
      template.steps_json.forEach((step) => {
        expect(validStepTypes).toContain(step.step_type);
      });
    });
  });

  it("should have consistent step numbering", () => {
    Object.values(MISSION_TEMPLATES).forEach((template) => {
      const steps = template.steps_json;
      steps.forEach((step, index) => {
        expect(step.step_number).toBe(index + 1);
      });
    });
  });

  it("should have valid timeout and retry configuration", () => {
    Object.values(MISSION_TEMPLATES).forEach((template) => {
      template.steps_json.forEach((step) => {
        expect(step.timeout_seconds).toBeGreaterThan(0);
        expect(step.retry_max).toBeGreaterThanOrEqual(0);
      });
    });
  });

  it("should have credit configuration for premium step types", () => {
    Object.values(MISSION_TEMPLATES).forEach((template) => {
      template.steps_json.forEach((step) => {
        if (
          step.step_type === "premium_action" ||
          step.step_type === "llm_text"
        ) {
          expect(step.requires_credit).toBe(true);
          expect(["allowance", "premium"]).toContain(step.credit_type);
          expect(step.credit_amount).toBeGreaterThan(0);
        }
      });
    });
  });
});

// ============================================================================
// OUTPUT VALIDATION TESTS
// ============================================================================

describe("Output Validation", () => {
  it("should validate valid content output", () => {
    const output = {
      output_type: "content",
      content: {
        text: "Great content here",
        format: "post",
        platform: "instagram",
      },
      artifact_count: 1,
    };

    expect(validateOutput(output)).toBe(true);
  });

  it("should validate valid image output", () => {
    const output = {
      output_type: "image",
      content: {
        url: "https://example.com/image.png",
        alt_text: "Test image",
      },
      artifact_count: 1,
    };

    expect(validateOutput(output)).toBe(true);
  });

  it("should reject invalid content output (missing text)", () => {
    const output = {
      output_type: "content",
      content: {
        format: "post",
      },
      artifact_count: 1,
    };

    expect(() => validateOutput(output)).toThrow(MissionError);
  });

  it("should reject invalid image output (invalid URL)", () => {
    const output = {
      output_type: "image",
      content: {
        url: "not-a-url",
      },
      artifact_count: 1,
    };

    expect(() => validateOutput(output)).toThrow(MissionError);
  });

  it("should validate artifacts", () => {
    const output = {
      output_type: "content",
      content: { text: "test" },
      artifact_count: 2,
    };

    expect(validateArtifacts(output, 2)).toBe(true);
  });

  it("should reject missing required artifacts", () => {
    const output = {
      output_type: "content",
      content: { text: "test" },
      artifact_count: 1,
    };

    expect(() => validateArtifacts(output, 2)).toThrow(MissionError);
  });

  it("should validate batch of outputs", () => {
    const outputs = [
      {
        output_type: "content",
        content: { text: "Content 1", format: "post" },
        artifact_count: 0,
      },
      {
        output_type: "content",
        content: { text: "Content 2", format: "post" },
        artifact_count: 0,
      },
    ];

    expect(validateOutputs(outputs)).toBe(true);
  });
});

// ============================================================================
// TEMPLATE COVERAGE TESTS
// ============================================================================

describe("Template Specific Validation", () => {
  it("content_batch_3d should have content generation steps", () => {
    const template = getTemplate("content_batch_3d");
    const stepTypes = template!.steps_json.map((s) => s.step_type);

    expect(stepTypes).toContain("brain_read");
    expect(stepTypes).toContain("llm_text");
    expect(stepTypes).toContain("write_outputs");
  });

  it("scrape_light_focus should have premium action steps", () => {
    const template = getTemplate("scrape_light_focus");
    const stepTypes = template!.steps_json.map((s) => s.step_type);

    expect(stepTypes).toContain("premium_action");
    expect(stepTypes).toContain("brain_update");
  });

  it("ask_glimy_chat should be quick and low-cost", () => {
    const template = getTemplate("ask_glimy_chat");

    expect(template!.estimated_minutes).toBeLessThanOrEqual(5);
    expect(template!.credit_cost_allowance).toBeLessThanOrEqual(1);
  });

  it("image_gen_batch should require premium credits", () => {
    const template = getTemplate("image_gen_batch");

    expect(template!.credit_cost_premium).toBeGreaterThan(0);
  });

  it("discovery missions should have lower cost than execution", () => {
    const discovery = getTemplate("scrape_light_focus");
    const execution = getTemplate("content_batch_7d");

    const discoveryCost =
      discovery!.credit_cost_allowance + discovery!.credit_cost_premium;
    const executionCost =
      execution!.credit_cost_allowance + execution!.credit_cost_premium;

    expect(discoveryCost).toBeLessThan(executionCost);
  });

  it("daily_pulse should be executable anytime", () => {
    const template = getTemplate("daily_pulse");

    expect(template!.phase_min).toBe("F1");
    expect(template!.phase_max).toBe("F7");
    expect(template!.cooldown_hours).toBeLessThanOrEqual(24);
  });
});

// ============================================================================
// MISSION EXECUTION FLOW TESTS
// ============================================================================

describe("Mission Execution Flow", () => {
  it("should track step progression correctly", () => {
    const template = getTemplate("content_batch_3d");
    const steps = template!.steps_json;

    // Steps should execute in order
    let previousTime = 0;
    steps.forEach((step) => {
      expect(step.step_number).toBeGreaterThan(previousTime);
      previousTime = step.step_number;
    });
  });

  it("should handle step failure with skip_on_failure", () => {
    const template = getTemplate("scrape_light_focus");
    const updateStep = template!.steps_json.find(
      (s) => s.step_type === "brain_update",
    );

    // brain_update should skip on failure
    expect(updateStep!.skip_on_failure).toBe(true);
  });

  it("should retry critical steps on failure", () => {
    const template = getTemplate("content_batch_3d");
    const llmStep = template!.steps_json.find(
      (s) => s.step_type === "llm_text",
    );

    // LLM steps should allow retries
    expect(llmStep!.retry_max).toBeGreaterThan(0);
  });

  it("user_input steps should pause mission execution", () => {
    const template = getTemplate("content_batch_3d");
    const userInputStep = template!.steps_json.find(
      (s) => s.step_type === "user_input",
    );

    // User input should exist and pause execution
    expect(userInputStep).toBeDefined();
    expect(userInputStep!.timeout_seconds).toBeGreaterThan(3600); // More than 1 hour timeout
  });

  it("finalize step should be last step", () => {
    Object.values(MISSION_TEMPLATES).forEach((template) => {
      const steps = template.steps_json;
      const lastStep = steps[steps.length - 1];

      expect(lastStep.step_type).toBe("finalize");
    });
  });
});

// ============================================================================
// CREDIT ECONOMY TESTS
// ============================================================================

describe("Credit Economy", () => {
  it("should calculate total cost for mission", () => {
    const template = getTemplate("content_batch_3d");

    const totalCost = {
      allowance: template!.credit_cost_allowance,
      premium: template!.credit_cost_premium,
    };

    expect(totalCost.allowance).toBeGreaterThanOrEqual(0);
    expect(totalCost.premium).toBeGreaterThanOrEqual(0);
  });

  it("should have non-zero cost for premium actions", () => {
    const premiumTemplates = getTemplatesByType("execution").filter((t) =>
      t.steps_json.some((s) => s.step_type === "premium_action"),
    );

    premiumTemplates.forEach((template) => {
      const hasCost =
        template.credit_cost_allowance > 0 || template.credit_cost_premium > 0;
      expect(hasCost).toBe(true);
    });
  });

  it("should have minimal cost for lightweight missions", () => {
    const lightweightTemplates = ["ask_glimy_chat", "daily_pulse"];

    lightweightTemplates.forEach((code) => {
      const template = getTemplate(code);
      const totalCost =
        template!.credit_cost_allowance + template!.credit_cost_premium;

      expect(totalCost).toBeLessThan(20);
    });
  });
});
