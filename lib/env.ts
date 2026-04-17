/**
 * lib/env.ts
 * Brief 25: Secrets & Configuration
 *
 * Single source of truth for all environment variables.
 * - Public vars (NEXT_PUBLIC_*) are safe for browser
 * - Server vars must NEVER be exposed to the client
 * - Validation runs at startup and logs warnings for missing vars
 */

// ============================================================================
// PUBLIC VARIABLES (safe for browser, NEXT_PUBLIC_* prefix)
// ============================================================================
export const publicEnv = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "https://glimad-app.vercel.app",
  LOGO_URL: process.env.NEXT_PUBLIC_LOGO_URL ?? "",
  STRIPE_PUBLISHABLE_KEY:
    process.env.STRIPE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
    "",
} as const;

// ============================================================================
// SERVER-ONLY VARIABLES (backend, never expose to browser)
// ============================================================================
export const serverEnv = {
  // Supabase
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  DATABASE_URL: process.env.DATABASE_URL ?? "",

  // Anthropic
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  ANTHROPIC_MODEL_HAIKU:
    process.env.ANTHROPIC_MODEL_HAIKU ?? "claude-haiku-4-5",
  ANTHROPIC_MODEL_SONNET:
    process.env.ANTHROPIC_MODEL_SONNET ?? "claude-sonnet-4-5",

  // Stripe
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  STRIPE_PRICE_BASE: process.env.STRIPE_PRICE_BASE ?? "",
  STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO ?? "",
  STRIPE_PRICE_ELITE: process.env.STRIPE_PRICE_ELITE ?? "",

  // Email (Resend)
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
  EMAIL_FROM: process.env.EMAIL_FROM ?? "hola@glimad.com",

  // n8n
  N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL ?? "",
  N8N_API_KEY: process.env.N8N_API_KEY ?? "",
  N8N_WEBHOOK_SECRET: process.env.N8N_WEBHOOK_SECRET ?? "",

  // Data providers
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY ?? "",
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID ?? "",
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET ?? "",
  TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN ?? "",
  APIFY_API_TOKEN: process.env.APIFY_API_TOKEN ?? "",

  // App
  CRON_SECRET: process.env.CRON_SECRET ?? "",
  DEFAULT_CURRENCY: process.env.DEFAULT_CURRENCY ?? "EUR",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "",
} as const;

// ============================================================================
// LEGACY FLAT EXPORT (backwards compatibility with existing code)
// ============================================================================
export const env = {
  // Public
  NEXT_PUBLIC_SUPABASE_URL: publicEnv.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: publicEnv.SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: publicEnv.APP_URL,
  // Server
  SUPABASE_SERVICE_ROLE_KEY: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY: serverEnv.ANTHROPIC_API_KEY,
  STRIPE_SECRET_KEY: serverEnv.STRIPE_SECRET_KEY,
  RESEND_API_KEY: serverEnv.RESEND_API_KEY,
  CRON_SECRET: serverEnv.CRON_SECRET || "fallback-cron-secret",
  DEFAULT_CURRENCY: serverEnv.DEFAULT_CURRENCY,
};

// ============================================================================
// REQUIRED VARS PER ENVIRONMENT TIER
// ============================================================================

/** Critical — app will not function without these */
const REQUIRED_CORE: Array<keyof typeof serverEnv | keyof typeof publicEnv> = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
];

/** Required for payments */
const REQUIRED_PAYMENTS: Array<keyof typeof serverEnv> = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
];

/** Required for email */
const REQUIRED_EMAIL: Array<keyof typeof serverEnv> = ["RESEND_API_KEY"];

/** Required for cron jobs */
const REQUIRED_CRON: Array<keyof typeof serverEnv> = ["CRON_SECRET"];

// ============================================================================
// VALIDATION
// ============================================================================

export interface EnvValidationResult {
  valid: boolean;
  missing_core: string[];
  missing_payments: string[];
  missing_email: string[];
  missing_cron: string[];
  warnings: string[];
}

/**
 * Validate environment variables and return detailed result.
 * Call this at startup (e.g. in a health check route).
 */
export function validateEnvDetailed(): EnvValidationResult {
  const allEnv = { ...publicEnv, ...serverEnv };

  const missing_core = REQUIRED_CORE.filter(
    (k) => !allEnv[k as keyof typeof allEnv],
  );
  const missing_payments = REQUIRED_PAYMENTS.filter((k) => !serverEnv[k]);
  const missing_email = REQUIRED_EMAIL.filter((k) => !serverEnv[k]);
  const missing_cron = REQUIRED_CRON.filter((k) => !serverEnv[k]);

  const warnings: string[] = [];

  // Warn if using fallback cron secret
  if (
    serverEnv.CRON_SECRET === "" ||
    serverEnv.CRON_SECRET === "fallback-cron-secret"
  ) {
    warnings.push("CRON_SECRET is not set — cron endpoints are unprotected");
  }

  // Warn if n8n not configured (non-critical)
  if (!serverEnv.N8N_WEBHOOK_URL) {
    warnings.push("N8N_WEBHOOK_URL not set — n8n integrations will be skipped");
  }

  // Warn if no data providers configured
  const dataProviders = [
    serverEnv.YOUTUBE_API_KEY,
    serverEnv.TWITTER_BEARER_TOKEN,
    serverEnv.SPOTIFY_CLIENT_ID,
  ];
  if (dataProviders.every((v) => !v)) {
    warnings.push(
      "No social data providers configured (YOUTUBE_API_KEY, TWITTER_BEARER_TOKEN, SPOTIFY_CLIENT_ID)",
    );
  }

  const valid = missing_core.length === 0;

  return {
    valid,
    missing_core,
    missing_payments,
    missing_email,
    missing_cron,
    warnings,
  };
}

/**
 * Simple boolean check — logs warnings to console.
 * Backwards-compatible with existing callers.
 */
export function validateEnv(): boolean {
  const result = validateEnvDetailed();

  if (result.missing_core.length > 0) {
    console.error(
      "[ENV] Missing critical environment variables:",
      result.missing_core,
    );
  }
  if (result.missing_payments.length > 0) {
    console.warn("[ENV] Missing payment variables:", result.missing_payments);
  }
  if (result.missing_email.length > 0) {
    console.warn("[ENV] Missing email variables:", result.missing_email);
  }
  for (const warning of result.warnings) {
    console.warn("[ENV]", warning);
  }

  return result.valid;
}

// ============================================================================
// FEATURE FLAGS (derived from env)
// ============================================================================

/**
 * Runtime feature flags derived from environment configuration.
 * Use these instead of checking env vars directly in business logic.
 */
export const features = {
  /** Payments enabled when Stripe keys are set */
  payments: !!(serverEnv.STRIPE_SECRET_KEY && serverEnv.STRIPE_WEBHOOK_SECRET),

  /** Email enabled when Resend key is set */
  email: !!serverEnv.RESEND_API_KEY,

  /** n8n integration enabled */
  n8n: !!serverEnv.N8N_WEBHOOK_URL,

  /** Social scraping: YouTube */
  scrape_youtube: !!serverEnv.YOUTUBE_API_KEY,

  /** Social scraping: Twitter/X */
  scrape_twitter: !!serverEnv.TWITTER_BEARER_TOKEN,

  /** Social scraping: Spotify */
  scrape_spotify: !!(
    serverEnv.SPOTIFY_CLIENT_ID && serverEnv.SPOTIFY_CLIENT_SECRET
  ),

  /** Apify scraping (Instagram/TikTok premium) */
  scrape_apify: !!serverEnv.APIFY_API_TOKEN,
} as const;

export type FeatureKey = keyof typeof features;
