/**
 * lib/missions/steps/external-webhook.ts
 * External Webhook Step Executor
 * Brief 10 Implementation
 */

import { StepExecutionContext, CoreOutput, MissionError } from "../types";

/**
 * Execute external_webhook step: Call external service via webhook (n8n, Zapier, etc)
 */
export async function executeExternalWebhook(
  context: StepExecutionContext,
): Promise<CoreOutput | null> {
  const step = context.step;
  const config = step.config as Record<string, unknown>;

  const webhookService = config.webhook_service as string;

  // Get webhook URL from environment or config
  const webhookUrl = getWebhookUrl(webhookService);
  if (!webhookUrl) {
    throw new MissionError(
      "WEBHOOK_URL_NOT_FOUND",
      `Webhook URL not configured for ${webhookService}`,
    );
  }

  try {
    // Prepare payload from brain context + params
    const payload = {
      missionId: context.instanceId,
      projectId: context.projectId,
      templateCode: context.templateCode,
      stepNumber: step.step_number,
      brainContext: context.brainContext,
      params: context.params,
      timestamp: new Date().toISOString(),
    };

    // Call webhook
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mission-ID": context.instanceId,
        "X-Project-ID": context.projectId,
        Authorization: `Bearer ${process.env.WEBHOOK_SECRET || ""}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned status ${response.status}`);
    }

    const result = await response.json();

    // Update brain context with webhook response
    if (context.brainContext) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (context.brainContext as any)["__webhook_response"] = result;
    }

    return null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new MissionError(
      "WEBHOOK_EXECUTION_FAILED",
      `Webhook call failed: ${errorMsg}`,
    );
  }
}

/**
 * Get webhook URL from environment or config
 */
function getWebhookUrl(service: string): string | null {
  let url: string | undefined;
  switch (service) {
    case "n8n_scheduler":
      url = process.env.N8N_SCHEDULER_WEBHOOK;
      break;
    case "n8n_autopost":
      url = process.env.N8N_AUTOPOST_WEBHOOK;
      break;
    case "zapier":
      url = process.env.ZAPIER_WEBHOOK;
      break;
    default:
      url = process.env[`WEBHOOK_${service.toUpperCase()}`];
  }
  return url || null;
}
