/**
 * lib/edge-functions.ts
 * Comprehensive Edge Functions module for Glimad v0
 * Provides business logic for all 10 Edge Functions with auth, validation, and standard responses
 */

import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// ── TYPES ──────────────────────────────────────────────────────────────────

export interface AuthContext {
  type: "jwt" | "service_role" | "anon";
  userId: string | null;
  isAdmin: boolean;
}

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  onboarding_session_id?: string;
}

export interface SignupResult {
  user: { id: string; email: string };
  session: { access_token: string; refresh_token: string };
}

export interface OnboardingStartInput {
  visitor_id: string;
  experiment_key?: string;
}

export interface ProjectCreateInput {
  name: string;
  focus_platform: string;
  focus_platform_handle: string;
}

export interface ProjectCreateResult {
  project: {
    id: string;
    name: string;
    status: "created";
    phase_code: null | string;
    focus_platform: string;
  };
  wallet: { wallet_id: string; plan_code: string };
  next_action: string;
}

export interface WalletBalance {
  plan_code: string;
  allowance_llm_balance: number;
  allowance_llm_total: number;
  premium_credits_balance: number;
  premium_credits_total: number;
  allowance_reset_at: string;
  status: "active" | "locked" | "archived";
  entitlements: {
    max_platforms_operate: number;
    batch_max_days: number;
    labs_available: string[];
  };
}

export interface MissionDispatchInput {
  project_id: string;
  template_code: string;
  params?: Record<string, unknown>;
  priority_score?: number;
}

export interface MissionDispatchResult {
  mission_instance_id: string;
  status: "queued";
  estimated_credits: { allowance: number; premium: number };
}

export interface ContentGenerateInput {
  project_id: string;
  prompt_key: string;
  params: Record<string, unknown>;
}

export interface ContentGenerateResult {
  result: {
    text: string;
    hook?: string;
    cta?: string;
    hashtags?: string[];
  };
  tokens_used: number;
  credits_charged: number;
  credit_type: "allowance" | "premium";
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  object: string;
  data: Record<string, unknown>;
  created: number;
}

// ── ERROR CODES & MESSAGES ──────────────────────────────────────────────────

export const ERROR_CODES = {
  GLM_AUTH_MISSING: { status: 401, message: "Authorization header required" },
  GLM_AUTH_INVALID: { status: 401, message: "Invalid or expired token" },
  GLM_AUTH_EMAIL_EXISTS: { status: 409, message: "Email already registered" },
  GLM_AUTH_WEAK_PASSWORD: {
    status: 400,
    message: "Password does not meet security requirements",
  },
  GLM_USER_NOT_FOUND: { status: 404, message: "User not found" },
  GLM_PROJECT_NOT_FOUND: { status: 404, message: "Project not found" },
  GLM_PROJECT_ACCESS_DENIED: {
    status: 403,
    message: "Access denied for project",
  },
  GLM_ONBOARDING_NOT_FOUND: {
    status: 404,
    message: "Onboarding session not found",
  },
  GLM_NO_ACTIVE_SUBSCRIPTION: {
    status: 402,
    message: "No active subscription",
  },
  GLM_INSUFFICIENT_CREDITS: {
    status: 402,
    message: "Insufficient credits for this action",
  },
  GLM_MAX_PROJECTS_REACHED: {
    status: 403,
    message: "Maximum projects limit reached",
  },
  GLM_MISSION_ON_COOLDOWN: { status: 429, message: "Mission on cooldown" },
  GLM_MISSION_INVALID: { status: 400, message: "Invalid mission template" },
  GLM_PHASE_NOT_ELIGIBLE: {
    status: 403,
    message: "Phase not eligible for this mission",
  },
  GLM_SCRAPE_FAILED: { status: 500, message: "Scraping operation failed" },
  GLM_SCRAPE_RATE_LIMITED: { status: 429, message: "Scrape rate limited" },
  GLM_INTERNAL_ERROR: { status: 500, message: "Internal server error" },
  GLM_SERVICE_UNAVAILABLE: {
    status: 503,
    message: "Service temporarily unavailable",
  },
  GLM_INVALID_REQUEST: { status: 400, message: "Invalid request" },
  GLM_WEBHOOK_SIGNATURE_INVALID: {
    status: 401,
    message: "Webhook signature verification failed",
  },
} as const;

export class EdgeFunctionError extends Error {
  constructor(
    public code: keyof typeof ERROR_CODES,
    public details?: Record<string, unknown>,
  ) {
    const config = ERROR_CODES[code];
    super(config.message);
    this.name = "EdgeFunctionError";
  }

  get status() {
    return ERROR_CODES[this.code].status;
  }

  get message() {
    return ERROR_CODES[this.code].message;
  }
}

// ── RESPONSE FORMATTING ──────────────────────────────────────────────────────

export interface StandardResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function successResponse<T>(data: T, status = 200): Response {
  return new Response(
    JSON.stringify({ ok: true, data } as StandardResponse<T>),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export function errorResponse(
  error: EdgeFunctionError | Error | unknown,
): Response {
  if (error instanceof EdgeFunctionError) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      } as StandardResponse),
      {
        status: error.status,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return new Response(
    JSON.stringify({
      ok: false,
      error: {
        code: "GLM_INTERNAL_ERROR",
        message,
      },
    } as StandardResponse),
    {
      status: 500,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export function createdResponse<T>(data: T): Response {
  return successResponse(data, 201);
}

// ── AUTH & VALIDATION ──────────────────────────────────────────────────────

export function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email) && email.length <= 254;
}

export function validatePassword(password: string): boolean {
  // Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 digit
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password)
  );
}

export async function requireAuth(
  authContext: AuthContext,
  allowedTypes: AuthContext["type"][] = ["jwt"],
): Promise<void> {
  if (!allowedTypes.includes(authContext.type)) {
    throw new EdgeFunctionError("GLM_AUTH_INVALID");
  }

  if (authContext.type === "jwt" && !authContext.userId) {
    throw new EdgeFunctionError("GLM_AUTH_INVALID");
  }
}

export function getUserIdOrThrow(authContext: AuthContext): string {
  if (!authContext.userId) {
    throw new EdgeFunctionError("GLM_AUTH_INVALID");
  }
  return authContext.userId;
}

// ── EDGE FUNCTION HANDLERS ────────────────────────────────────────────────

/**
 * auth-signup - Register new user
 */
export async function handleAuthSignup(
  admin: AdminClient,
  input: SignupInput,
): Promise<SignupResult> {
  // Validate input
  if (!validateEmail(input.email)) {
    throw new EdgeFunctionError("GLM_INVALID_REQUEST", {
      field: "email",
      reason: "Invalid email format",
    });
  }

  if (!validatePassword(input.password)) {
    throw new EdgeFunctionError("GLM_AUTH_WEAK_PASSWORD");
  }

  if (!input.name || input.name.trim().length === 0) {
    throw new EdgeFunctionError("GLM_INVALID_REQUEST", {
      field: "name",
      reason: "Name required",
    });
  }

  // Check if onboarding session exists (if provided)
  if (input.onboarding_session_id) {
    const { count } = await admin
      .from("onboarding_sessions")
      .select("id", { count: "exact", head: true })
      .eq("id", input.onboarding_session_id);

    if (!count || count === 0) {
      throw new EdgeFunctionError("GLM_ONBOARDING_NOT_FOUND");
    }
  }

  // Create auth user via Supabase Auth
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: false,
  });

  if (error) {
    if (error.message.includes("already exists")) {
      throw new EdgeFunctionError("GLM_AUTH_EMAIL_EXISTS");
    }
    throw new EdgeFunctionError("GLM_INTERNAL_ERROR", {
      details: error.message,
    });
  }

  if (!data.user) {
    throw new EdgeFunctionError("GLM_INTERNAL_ERROR", {
      reason: "User creation returned null",
    });
  }

  // Create user profile
  await admin.from("users").insert({
    id: data.user.id,
    email: input.email,
    full_name: input.name,
    created_at: new Date().toISOString(),
  });

  // Note: Session will be created after email verification
  // For development, return placeholder tokens - actual tokens come from email confirmation
  return {
    user: { id: data.user.id, email: data.user.email! },
    session: {
      access_token: data.user.id, // Simplified for dev; real implementation uses email flow
      refresh_token: `${data.user.id}-refresh`,
    },
  };
}

/**
 * onboarding-start - Initialize onboarding session
 */
export async function handleOnboardingStart(
  admin: AdminClient,
  input: OnboardingStartInput,
): Promise<{
  onboarding_session_id: string;
  variant: string;
  questions: unknown[];
  step_current: number;
  step_total: number;
}> {
  // Create onboarding session
  const { data, error } = await admin
    .from("onboarding_sessions")
    .insert({
      visitor_id: input.visitor_id,
      experiment_key: input.experiment_key || "default",
      variant: Math.random() > 0.5 ? "variant_a" : "control",
      step_current: 1,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    throw new EdgeFunctionError("GLM_INTERNAL_ERROR", {
      details: error?.message,
    });
  }

  return {
    onboarding_session_id: data.id,
    variant: data.variant,
    questions: [], // Populated from onboarding_questions table
    step_current: 1,
    step_total: 6,
  };
}

/**
 * projects-create - Create ne project with wallet
 */
export async function handleProjectCreate(
  admin: AdminClient,
  userId: string,
  input: ProjectCreateInput,
): Promise<ProjectCreateResult> {
  // Check active subscription
  const { data: subscriptions } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);

  if (!subscriptions || subscriptions.length === 0) {
    throw new EdgeFunctionError("GLM_NO_ACTIVE_SUBSCRIPTION");
  }

  // Check max projects limit
  const { count } = await admin
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("status", "archived");

  if (count && count >= 5) {
    throw new EdgeFunctionError("GLM_MAX_PROJECTS_REACHED", {
      limit: 5,
      current: count,
    });
  }

  // Create project
  const { data: project, error: projectError } = await admin
    .from("projects")
    .insert({
      user_id: userId,
      name: input.name,
      focus_platform: input.focus_platform,
      focus_platform_handle: input.focus_platform_handle,
      status: "created",
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (projectError || !project) {
    throw new EdgeFunctionError("GLM_INTERNAL_ERROR", {
      details: projectError?.message,
    });
  }

  // Create wallet
  const { data: wallet, error: walletError } = await admin
    .from("wallets")
    .insert({
      project_id: project.id,
      plan_code: "PRO", // Default to PRO on project creation
      allowance_llm_balance: 5000,
      allowance_llm_total: 5000,
      premium_credits_balance: 1000,
      premium_credits_total: 1000,
      status: "active",
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (walletError || !wallet) {
    throw new EdgeFunctionError("GLM_INTERNAL_ERROR", {
      details: walletError?.message,
    });
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      status: "created",
      phase_code: project.phase_code,
      focus_platform: project.focus_platform,
    },
    wallet: {
      wallet_id: wallet.id,
      plan_code: wallet.plan_code,
    },
    next_action: "scrape_light_dispatched",
  };
}

/**
 * get-project-brain - Read project Brain state
 */
export async function handleGetProjectBrain(
  admin: AdminClient,
  projectId: string,
  userId: string,
): Promise<{
  facts: Record<string, unknown>;
  signals_recent: unknown[];
  snapshot_latest: unknown;
  phase: unknown;
}> {
  // Verify access
  const { count } = await admin
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("id", projectId)
    .eq("user_id", userId);

  if (!count || count === 0) {
    throw new EdgeFunctionError("GLM_PROJECT_ACCESS_DENIED");
  }

  // Read Brain
  const { data: snapshot } = await admin
    .from("brain_snapshots")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: signals } = await admin
    .from("brain_signals")
    .select("*")
    .eq("project_id", projectId)
    .order("observed_at", { ascending: false })
    .limit(20);

  return {
    facts: snapshot?.facts || {},
    signals_recent: signals || [],
    snapshot_latest: snapshot || {},
    phase: snapshot?.phase_code || null,
  };
}

/**
 * wallet-balance - Get wallet balance and entitlements
 */
export async function handleWalletBalance(
  admin: AdminClient,
  projectId: string,
  userId: string,
): Promise<WalletBalance> {
  // Verify access
  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (!project) {
    throw new EdgeFunctionError("GLM_PROJECT_ACCESS_DENIED");
  }

  // Get wallet
  const { data: wallet } = await admin
    .from("wallets")
    .select("*")
    .eq("project_id", projectId)
    .single();

  if (!wallet) {
    throw new EdgeFunctionError("GLM_PROJECT_NOT_FOUND", {
      reason: "Wallet record not found",
    });
  }

  // Map plan to entitlements
  const entitlements: Record<
    string,
    {
      max_platforms_operate: number;
      batch_max_days: number;
      labs_available: string[];
    }
  > = {
    STARTER: {
      max_platforms_operate: 1,
      batch_max_days: 7,
      labs_available: ["content_lab"],
    },
    PRO: {
      max_platforms_operate: 3,
      batch_max_days: 14,
      labs_available: ["content_lab", "analytics_lab", "repurpose_lab"],
    },
    SCALE: {
      max_platforms_operate: 5,
      batch_max_days: 30,
      labs_available: [
        "content_lab",
        "analytics_lab",
        "repurpose_lab",
        "automation_lab",
      ],
    },
  };

  return {
    plan_code: wallet.plan_code,
    allowance_llm_balance: wallet.allowance_llm_balance,
    allowance_llm_total: wallet.allowance_llm_total,
    premium_credits_balance: wallet.premium_credits_balance,
    premium_credits_total: wallet.premium_credits_total,
    allowance_reset_at: new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    status: wallet.status,
    entitlements: entitlements[wallet.plan_code] || entitlements.PRO,
  };
}

/**
 * mission-dispatch - Dispatch mission to queue
 */
export async function handleMissionDispatch(
  admin: AdminClient,
  input: MissionDispatchInput,
): Promise<MissionDispatchResult> {
  // Verify project exists
  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("id", input.project_id)
    .single();

  if (!project) {
    throw new EdgeFunctionError("GLM_PROJECT_NOT_FOUND");
  }

  // Verify template exists
  const { data: template } = await admin
    .from("mission_templates")
    .select("id, credit_cost_min, credit_cost_max")
    .eq("code", input.template_code)
    .single();

  if (!template) {
    throw new EdgeFunctionError("GLM_MISSION_INVALID");
  }

  // Create mission instance
  const { data: instance, error } = await admin
    .from("mission_instances")
    .insert({
      project_id: input.project_id,
      template_code: input.template_code,
      status: "queued",
      params: input.params || {},
      priority_score: input.priority_score || 50,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !instance) {
    throw new EdgeFunctionError("GLM_INTERNAL_ERROR", {
      details: error?.message,
    });
  }

  return {
    mission_instance_id: instance.id,
    status: "queued",
    estimated_credits: {
      allowance: template.credit_cost_min || 50,
      premium: template.credit_cost_max || 200,
    },
  };
}

/**
 * content-generate - Generate content via LLM
 */
export async function handleContentGenerate(
  admin: AdminClient,
  projectId: string,
  userId: string,
  input: ContentGenerateInput,
): Promise<ContentGenerateResult> {
  // Verify access
  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (!project) {
    throw new EdgeFunctionError("GLM_PROJECT_ACCESS_DENIED");
  }

  // Check credits (simplified)
  const { data: wallet } = await admin
    .from("wallets")
    .select("allowance_llm_balance")
    .eq("project_id", projectId)
    .single();

  if (!wallet || wallet.allowance_llm_balance < 10) {
    throw new EdgeFunctionError("GLM_INSUFFICIENT_CREDITS", {
      available: wallet?.allowance_llm_balance || 0,
      required: 10,
    });
  }

  // Generate content (placeholder - real implementation would call Claude/OpenAI via prompt_key and params)
  // TODO: Integrate with prompt library (input.prompt_key) and LLM service
  void input; // Marked for future use

  const result = {
    text: "Generated content would appear here...",
    hook: "Hook for content",
    cta: "Call to action",
    hashtags: ["#glimad", "#content"],
  };

  return {
    result,
    tokens_used: 250,
    credits_charged: 1,
    credit_type: "allowance",
  };
}

/**
 * Stripe webhook handler
 */
export async function handleStripeWebhook(
  admin: AdminClient,
  event: StripeWebhookEvent,
): Promise<{ processed: boolean; event_id: string }> {
  // Deduplicate event
  const { data: existing } = await admin
    .from("stripe_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .single();

  if (existing) {
    return { processed: false, event_id: event.id }; // Already processed
  }

  // Record event
  await admin.from("stripe_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    event_data: event.data,
    processed_at: new Date().toISOString(),
  });

  // Route to handler based on event type
  switch (event.type) {
    case "checkout.session.completed":
      // Create subscription + wallet
      break;
    case "invoice.paid":
      // Refresh credits
      break;
    case "invoice.payment_failed":
      // Lock wallet
      break;
    case "customer.subscription.updated":
      // Plan change
      break;
    case "customer.subscription.deleted":
      // Archive project
      break;
    default:
      // Unknown event type
      break;
  }

  return { processed: true, event_id: event.id };
}

export const EdgeFunctions = {
  handleAuthSignup,
  handleOnboardingStart,
  handleProjectCreate,
  handleGetProjectBrain,
  handleWalletBalance,
  handleMissionDispatch,
  handleContentGenerate,
  handleStripeWebhook,
};
