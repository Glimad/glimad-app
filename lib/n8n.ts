/**
 * Brief 20: N8N Workflows Catalog - Complete Module
 * Simplified single-file implementation for production
 */

import crypto from "crypto";

// ============================================================================
// ENUMS
// ============================================================================

export enum WorkflowName {
  SCRAPE_LIGHT = "glm_scrape_light",
  BATCH_CONTENT = "glm_batch_content",
  MEDIA_GEN = "glm_media_gen",
  DAILY_PULSE = "glm_daily_pulse",
  AUTOPOST = "glm_autopost",
  SCRAPE_METRICS = "glm_scrape_metrics",
}

export enum ContentFormat {
  REEL = "reel",
  CAROUSEL = "carousel",
  STORY = "story",
  FEED = "feed",
  SHORTS = "shorts",
  ARTICLE = "article",
  TWEET = "tweet",
  THREAD = "thread",
}

export enum SocialPlatform {
  INSTAGRAM = "instagram",
  TIKTOK = "tiktok",
  YOUTUBE = "youtube",
  LINKEDIN = "linkedin",
  TWITTER = "twitter",
}

export enum MediaType {
  IMAGE = "image",
  VIDEO = "video",
}

export enum MediaProvider {
  BANNERBEAR = "bannerbear",
  SHOTSTACK = "shotstack",
  DALL_E = "dalle",
  RUNWAY = "runway",
}

// ============================================================================
// TYPES
// ============================================================================

export interface GlmScrapeLightInput {
  project_id: string;
  platform: SocialPlatform;
  handle: string;
  scrape_type: string;
  callback_url: string;
  idempotency_key: string;
}

export interface WebhookCallback {
  status: "completed" | "failed";
  step_number: number;
  idempotency_key: string;
  result?: Record<string, unknown>;
  error?: { code: string; message: string; retriable: boolean };
  timestamp: string;
}

export interface HmacVerification {
  isValid: boolean;
  error?: string;
}

// ============================================================================
// WEBHOOK SECURITY
// ============================================================================

export class WebhookSecurity {
  static signPayload(payload: string | object, secret: string): string {
    const body =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    return crypto.createHmac("sha256", secret).update(body).digest("hex");
  }

  static verifySignature(
    payload: string | object,
    signature: string,
    secret: string,
  ): HmacVerification {
    try {
      const expected = this.signPayload(payload, secret);
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expected, "hex"),
      );
      return { isValid };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : "Verification failed",
      };
    }
  }

  static verifyRequest(
    headers: Record<string, string | string[] | undefined>,
    payload: string | object,
    secret: string,
  ): HmacVerification {
    const signature = headers["x-glimad-signature"];
    const timestamp = headers["x-glimad-timestamp"];

    if (!signature || typeof signature !== "string") {
      return { isValid: false, error: "Missing signature" };
    }
    if (!timestamp || typeof timestamp !== "string") {
      return { isValid: false, error: "Missing timestamp" };
    }

    const requestTime = parseInt(timestamp, 10);
    if (Math.abs(Date.now() - requestTime) > 5 * 60 * 1000) {
      return { isValid: false, error: "Request expired" };
    }

    return this.verifySignature(payload, signature, secret);
  }
}

// ============================================================================
// DISPATCHER
// ============================================================================

export class WorkflowDispatcher {
  constructor(
    private n8nBaseUrl: string = process.env.N8N_BASE_URL ||
      "https://n8n.glimad.com",
    private webhookSecret: string = process.env.N8N_WEBHOOK_SECRET || "",
  ) {}

  async dispatchScrapeLightV3(
    input: GlmScrapeLightInput,
  ): Promise<{ success: boolean; executionId?: string; error?: string }> {
    if (!this.webhookSecret) {
      return { success: false, error: "N8N_WEBHOOK_SECRET not configured" };
    }

    try {
      const signature = WebhookSecurity.signPayload(input, this.webhookSecret);
      const url = `${this.n8nBaseUrl}/webhook/${WorkflowName.SCRAPE_LIGHT}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-glimad-signature": signature,
          "x-glimad-timestamp": Date.now().toString(),
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await response.json()) as any;
      return { success: true, executionId: result.execution_id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error",
      };
    }
  }
}

// ============================================================================
// WEBHOOK CALLBACK HANDLER
// ============================================================================

export class WebhookCallbackHandler {
  static parseCallback(
    headers: Record<string, string | string[] | undefined>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: any,
    secret: string,
  ): { valid: boolean; callback?: WebhookCallback; error?: string } {
    const verification = WebhookSecurity.verifyRequest(headers, body, secret);
    if (!verification.isValid) {
      return { valid: false, error: verification.error };
    }

    if (
      !body.status ||
      !["completed", "failed"].includes(body.status as string)
    ) {
      return { valid: false, error: "Invalid status" };
    }

    return { valid: true, callback: body as WebhookCallback };
  }

  static isSuccess(callback: WebhookCallback): boolean {
    return callback.status === "completed";
  }

  static getErrorDetails(callback: WebhookCallback) {
    return {
      code: callback.error?.code ?? "UNKNOWN_ERROR",
      message: callback.error?.message ?? "Unknown error",
      retriable: callback.error?.retriable ?? false,
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getWebhookSecret(): string {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("N8N_WEBHOOK_SECRET not configured");
  }
  return secret;
}

export function getDispatcher(): WorkflowDispatcher {
  return new WorkflowDispatcher();
}
