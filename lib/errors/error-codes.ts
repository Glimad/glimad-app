/**
 * Glimad Error Code Catalog
 * All error codes follow the pattern: GLM_[CATEGORY]_[NUMBER]
 *
 * Categories:
 * - AUTH: Authentication & Authorization (001-099)
 * - USER: User Management (100-199)
 * - DATA: Data Operations (200-299)
 * - API: External API Integrations (300-399)
 * - PAY: Payment & Billing (400-499)
 * - MISSION: Mission System (500-599)
 * - BRAIN: Brain/AI System (600-699)
 * - SCRAPE: Social Media Scraping (700-799)
 * - STUDIO: Content Studio (800-899)
 * - SYS: System & Infrastructure (900-999)
 */

// ============================================================
// Error Code Types
// ============================================================

export type ErrorSeverity = "low" | "medium" | "high" | "critical";
export type RecoveryStrategy =
  | "retry"
  | "degrade"
  | "queue"
  | "escalate"
  | "ignore";

export interface ErrorCodeDefinition {
  code: string;
  message: string;
  httpStatus: number;
  severity: ErrorSeverity;
  recoveryStrategy: RecoveryStrategy;
  retryable: boolean;
  maxRetries: number;
  retryDelayMs: number;
  userMessage: string;
  internalDescription: string;
}

// ============================================================
// Authentication & Authorization Errors (GLM_AUTH_001-099)
// ============================================================

export const AUTH_ERRORS = {
  GLM_AUTH_001: {
    code: "GLM_AUTH_001",
    message: "Authentication required",
    httpStatus: 401,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Please sign in to continue",
    internalDescription:
      "User attempted to access protected resource without authentication",
  },
  GLM_AUTH_002: {
    code: "GLM_AUTH_002",
    message: "Invalid credentials",
    httpStatus: 401,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Invalid email or password",
    internalDescription: "Login attempt with incorrect credentials",
  },
  GLM_AUTH_003: {
    code: "GLM_AUTH_003",
    message: "Session expired",
    httpStatus: 401,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Your session has expired. Please sign in again",
    internalDescription: "JWT token has expired or is invalid",
  },
  GLM_AUTH_004: {
    code: "GLM_AUTH_004",
    message: "Insufficient permissions",
    httpStatus: 403,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "You don't have permission to perform this action",
    internalDescription:
      "User lacks required role or permission for this operation",
  },
  GLM_AUTH_005: {
    code: "GLM_AUTH_005",
    message: "Account suspended",
    httpStatus: 403,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "escalate" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage:
      "Your account has been suspended. Contact support for assistance",
    internalDescription:
      "User account is suspended due to policy violation or payment issues",
  },
  GLM_AUTH_006: {
    code: "GLM_AUTH_006",
    message: "Magic link expired",
    httpStatus: 400,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "This login link has expired. Please request a new one",
    internalDescription: "Magic link token has expired (>15 minutes)",
  },
  GLM_AUTH_007: {
    code: "GLM_AUTH_007",
    message: "OAuth provider error",
    httpStatus: 502,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 1000,
    userMessage: "Unable to connect to login provider. Please try again",
    internalDescription:
      "OAuth provider (Google/Facebook/etc) returned an error",
  },
  GLM_AUTH_008: {
    code: "GLM_AUTH_008",
    message: "Email not verified",
    httpStatus: 403,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Please verify your email address before continuing",
    internalDescription: "User email has not been verified",
  },
  GLM_AUTH_009: {
    code: "GLM_AUTH_009",
    message: "Rate limited - too many login attempts",
    httpStatus: 429,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "queue" as RecoveryStrategy,
    retryable: true,
    maxRetries: 1,
    retryDelayMs: 60000,
    userMessage: "Too many login attempts. Please wait a minute and try again",
    internalDescription: "User exceeded login attempt rate limit",
  },
} as const;

// ============================================================
// User Management Errors (GLM_USER_100-199)
// ============================================================

export const USER_ERRORS = {
  GLM_USER_100: {
    code: "GLM_USER_100",
    message: "User not found",
    httpStatus: 404,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "User not found",
    internalDescription: "Requested user ID does not exist in database",
  },
  GLM_USER_101: {
    code: "GLM_USER_101",
    message: "Email already registered",
    httpStatus: 409,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "This email is already registered. Try signing in instead",
    internalDescription: "Signup attempt with existing email address",
  },
  GLM_USER_102: {
    code: "GLM_USER_102",
    message: "Profile incomplete",
    httpStatus: 400,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Please complete your profile to continue",
    internalDescription: "User profile missing required fields",
  },
  GLM_USER_103: {
    code: "GLM_USER_103",
    message: "Onboarding not completed",
    httpStatus: 400,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Please complete onboarding to access this feature",
    internalDescription:
      "User attempted to access feature before completing onboarding",
  },
  GLM_USER_104: {
    code: "GLM_USER_104",
    message: "Invalid profile data",
    httpStatus: 400,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Please check your profile information and try again",
    internalDescription: "Profile update contains invalid data",
  },
  GLM_USER_105: {
    code: "GLM_USER_105",
    message: "Preferences save failed",
    httpStatus: 500,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 3,
    retryDelayMs: 500,
    userMessage: "Unable to save your preferences. Please try again",
    internalDescription: "Database error while saving user preferences",
  },
} as const;

// ============================================================
// Data Operation Errors (GLM_DATA_200-299)
// ============================================================

export const DATA_ERRORS = {
  GLM_DATA_200: {
    code: "GLM_DATA_200",
    message: "Database connection failed",
    httpStatus: 503,
    severity: "critical" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 3,
    retryDelayMs: 2000,
    userMessage: "Service temporarily unavailable. Please try again",
    internalDescription: "Unable to establish connection to Supabase",
  },
  GLM_DATA_201: {
    code: "GLM_DATA_201",
    message: "Query timeout",
    httpStatus: 504,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 1000,
    userMessage: "Request took too long. Please try again",
    internalDescription: "Database query exceeded timeout threshold",
  },
  GLM_DATA_202: {
    code: "GLM_DATA_202",
    message: "Record not found",
    httpStatus: 404,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "The requested item was not found",
    internalDescription: "Query returned no results for the given identifier",
  },
  GLM_DATA_203: {
    code: "GLM_DATA_203",
    message: "Duplicate record",
    httpStatus: 409,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "This item already exists",
    internalDescription: "Insert violated unique constraint",
  },
  GLM_DATA_204: {
    code: "GLM_DATA_204",
    message: "Foreign key constraint violation",
    httpStatus: 400,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Unable to complete this action due to related data",
    internalDescription: "Operation violated foreign key constraint",
  },
  GLM_DATA_205: {
    code: "GLM_DATA_205",
    message: "Validation failed",
    httpStatus: 400,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Please check your input and try again",
    internalDescription: "Request data failed validation rules",
  },
  GLM_DATA_206: {
    code: "GLM_DATA_206",
    message: "Transaction failed",
    httpStatus: 500,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 1000,
    userMessage: "Unable to complete the operation. Please try again",
    internalDescription: "Database transaction failed to commit",
  },
  GLM_DATA_207: {
    code: "GLM_DATA_207",
    message: "RLS policy denied",
    httpStatus: 403,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "You don't have access to this resource",
    internalDescription: "Row Level Security policy blocked the operation",
  },
} as const;

// ============================================================
// External API Errors (GLM_API_300-399)
// ============================================================

export const API_ERRORS = {
  GLM_API_300: {
    code: "GLM_API_300",
    message: "External API unavailable",
    httpStatus: 503,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 3,
    retryDelayMs: 2000,
    userMessage: "External service temporarily unavailable",
    internalDescription: "Third-party API is not responding",
  },
  GLM_API_301: {
    code: "GLM_API_301",
    message: "API rate limit exceeded",
    httpStatus: 429,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "queue" as RecoveryStrategy,
    retryable: true,
    maxRetries: 1,
    retryDelayMs: 60000,
    userMessage: "Service is busy. Please try again later",
    internalDescription: "Third-party API rate limit hit",
  },
  GLM_API_302: {
    code: "GLM_API_302",
    message: "API authentication failed",
    httpStatus: 502,
    severity: "critical" as ErrorSeverity,
    recoveryStrategy: "escalate" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Service configuration error. Our team has been notified",
    internalDescription: "API key/credentials invalid or expired",
  },
  GLM_API_303: {
    code: "GLM_API_303",
    message: "API response invalid",
    httpStatus: 502,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 1000,
    userMessage: "Received unexpected response. Please try again",
    internalDescription: "API returned malformed or unexpected response",
  },
  GLM_API_304: {
    code: "GLM_API_304",
    message: "API timeout",
    httpStatus: 504,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 3000,
    userMessage: "Request took too long. Please try again",
    internalDescription: "External API request timed out",
  },
  GLM_API_305: {
    code: "GLM_API_305",
    message: "Claude API error",
    httpStatus: 502,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 2000,
    userMessage: "AI service temporarily unavailable. Please try again",
    internalDescription: "Anthropic Claude API returned an error",
  },
  GLM_API_306: {
    code: "GLM_API_306",
    message: "Claude rate limit exceeded",
    httpStatus: 429,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "queue" as RecoveryStrategy,
    retryable: true,
    maxRetries: 1,
    retryDelayMs: 30000,
    userMessage: "AI service is busy. Please wait a moment",
    internalDescription: "Anthropic API rate limit hit",
  },
} as const;

// ============================================================
// Payment & Billing Errors (GLM_PAY_400-499)
// ============================================================

export const PAYMENT_ERRORS = {
  GLM_PAY_400: {
    code: "GLM_PAY_400",
    message: "Payment failed",
    httpStatus: 402,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage:
      "Payment could not be processed. Please try a different payment method",
    internalDescription: "Stripe payment intent failed",
  },
  GLM_PAY_401: {
    code: "GLM_PAY_401",
    message: "Card declined",
    httpStatus: 402,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Your card was declined. Please try a different card",
    internalDescription: "Card issuer declined the transaction",
  },
  GLM_PAY_402: {
    code: "GLM_PAY_402",
    message: "Subscription not found",
    httpStatus: 404,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "No active subscription found",
    internalDescription: "User does not have an active Stripe subscription",
  },
  GLM_PAY_403: {
    code: "GLM_PAY_403",
    message: "Subscription cancelled",
    httpStatus: 402,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage:
      "Your subscription has been cancelled. Please resubscribe to continue",
    internalDescription: "User's subscription is in cancelled state",
  },
  GLM_PAY_404: {
    code: "GLM_PAY_404",
    message: "Insufficient credits",
    httpStatus: 402,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage:
      "Not enough credits. Please purchase more or upgrade your plan",
    internalDescription:
      "User attempted action requiring more credits than available",
  },
  GLM_PAY_405: {
    code: "GLM_PAY_405",
    message: "Stripe webhook failed",
    httpStatus: 400,
    severity: "critical" as ErrorSeverity,
    recoveryStrategy: "escalate" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Payment verification failed. Please contact support",
    internalDescription: "Stripe webhook signature verification failed",
  },
  GLM_PAY_406: {
    code: "GLM_PAY_406",
    message: "Price not found",
    httpStatus: 404,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "escalate" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Product configuration error. Please contact support",
    internalDescription: "Stripe price ID not found in configuration",
  },
  GLM_PAY_407: {
    code: "GLM_PAY_407",
    message: "Stripe API error",
    httpStatus: 502,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 2000,
    userMessage: "Payment service temporarily unavailable. Please try again",
    internalDescription: "Stripe API returned an error",
  },
  GLM_PAY_408: {
    code: "GLM_PAY_408",
    message: "Customer not found",
    httpStatus: 404,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Payment profile not found. Please contact support",
    internalDescription: "Stripe customer ID not found for user",
  },
} as const;

// ============================================================
// Mission System Errors (GLM_MISSION_500-599)
// ============================================================

export const MISSION_ERRORS = {
  GLM_MISSION_500: {
    code: "GLM_MISSION_500",
    message: "Mission not found",
    httpStatus: 404,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Mission not found",
    internalDescription: "Requested mission ID does not exist",
  },
  GLM_MISSION_501: {
    code: "GLM_MISSION_501",
    message: "Mission already completed",
    httpStatus: 409,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "This mission has already been completed",
    internalDescription:
      "User attempted to complete an already completed mission",
  },
  GLM_MISSION_502: {
    code: "GLM_MISSION_502",
    message: "Mission expired",
    httpStatus: 410,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "This mission has expired",
    internalDescription: "Mission deadline has passed",
  },
  GLM_MISSION_503: {
    code: "GLM_MISSION_503",
    message: "Mission prerequisites not met",
    httpStatus: 400,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Complete the required missions first",
    internalDescription:
      "User attempted mission without completing prerequisites",
  },
  GLM_MISSION_504: {
    code: "GLM_MISSION_504",
    message: "Mission generation failed",
    httpStatus: 500,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 1000,
    userMessage: "Unable to generate mission. Please try again",
    internalDescription: "AI failed to generate mission content",
  },
  GLM_MISSION_505: {
    code: "GLM_MISSION_505",
    message: "Invalid mission response",
    httpStatus: 400,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Your response could not be validated. Please try again",
    internalDescription: "User's mission response failed validation",
  },
  GLM_MISSION_506: {
    code: "GLM_MISSION_506",
    message: "Mission limit reached",
    httpStatus: 429,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "You've reached your daily mission limit. Upgrade for more",
    internalDescription: "User exceeded daily/weekly mission quota",
  },
} as const;

// ============================================================
// Brain/AI System Errors (GLM_BRAIN_600-699)
// ============================================================

export const BRAIN_ERRORS = {
  GLM_BRAIN_600: {
    code: "GLM_BRAIN_600",
    message: "Brain not found",
    httpStatus: 404,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Your profile data is incomplete. Please complete onboarding",
    internalDescription: "User brain record not found in database",
  },
  GLM_BRAIN_601: {
    code: "GLM_BRAIN_601",
    message: "Brain update failed",
    httpStatus: 500,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 1000,
    userMessage: "Unable to update your profile. Please try again",
    internalDescription: "Failed to update user brain record",
  },
  GLM_BRAIN_602: {
    code: "GLM_BRAIN_602",
    message: "Brain computation timeout",
    httpStatus: 504,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 2000,
    userMessage: "Analysis taking too long. Please try again",
    internalDescription: "Brain computation exceeded timeout",
  },
  GLM_BRAIN_603: {
    code: "GLM_BRAIN_603",
    message: "Engine not found",
    httpStatus: 404,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Feature configuration error",
    internalDescription: "Requested engine does not exist",
  },
  GLM_BRAIN_604: {
    code: "GLM_BRAIN_604",
    message: "Engine execution failed",
    httpStatus: 500,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 1000,
    userMessage: "Unable to process your request. Please try again",
    internalDescription: "Engine (inflexion/phase/policy) execution failed",
  },
  GLM_BRAIN_605: {
    code: "GLM_BRAIN_605",
    message: "Insufficient signals",
    httpStatus: 400,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "We need more data to provide recommendations",
    internalDescription:
      "Not enough data points for accurate brain computation",
  },
  GLM_BRAIN_606: {
    code: "GLM_BRAIN_606",
    message: "Rollback failed",
    httpStatus: 500,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "escalate" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Unable to restore previous state. Please contact support",
    internalDescription: "Brain rollback operation failed",
  },
} as const;

// ============================================================
// Scraping System Errors (GLM_SCRAPE_700-799)
// ============================================================

export const SCRAPE_ERRORS = {
  GLM_SCRAPE_700: {
    code: "GLM_SCRAPE_700",
    message: "Platform not supported",
    httpStatus: 400,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "This platform is not supported yet",
    internalDescription: "User requested unsupported social platform",
  },
  GLM_SCRAPE_701: {
    code: "GLM_SCRAPE_701",
    message: "Profile not found",
    httpStatus: 404,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Profile not found. Please check the username",
    internalDescription: "Social media profile does not exist",
  },
  GLM_SCRAPE_702: {
    code: "GLM_SCRAPE_702",
    message: "Profile is private",
    httpStatus: 403,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "This profile is private and cannot be analyzed",
    internalDescription: "Social media profile has privacy restrictions",
  },
  GLM_SCRAPE_703: {
    code: "GLM_SCRAPE_703",
    message: "Scrape rate limited",
    httpStatus: 429,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "queue" as RecoveryStrategy,
    retryable: true,
    maxRetries: 1,
    retryDelayMs: 60000,
    userMessage: "Too many requests. Please try again later",
    internalDescription: "Platform rate limit reached",
  },
  GLM_SCRAPE_704: {
    code: "GLM_SCRAPE_704",
    message: "Scrape blocked",
    httpStatus: 403,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "escalate" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Unable to access this platform. Please try again later",
    internalDescription: "Platform blocked our request (IP ban, captcha, etc)",
  },
  GLM_SCRAPE_705: {
    code: "GLM_SCRAPE_705",
    message: "Scrape parse failed",
    httpStatus: 500,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 1000,
    userMessage: "Unable to read profile data. Please try again",
    internalDescription: "Failed to parse scraped HTML/JSON response",
  },
  GLM_SCRAPE_706: {
    code: "GLM_SCRAPE_706",
    message: "API key missing",
    httpStatus: 500,
    severity: "critical" as ErrorSeverity,
    recoveryStrategy: "escalate" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Service configuration error. Our team has been notified",
    internalDescription: "Required API key for platform not configured",
  },
  GLM_SCRAPE_707: {
    code: "GLM_SCRAPE_707",
    message: "Scrape job not found",
    httpStatus: 404,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Scrape job not found",
    internalDescription: "Requested scrape job ID does not exist",
  },
} as const;

// ============================================================
// Content Studio Errors (GLM_STUDIO_800-899)
// ============================================================

export const STUDIO_ERRORS = {
  GLM_STUDIO_800: {
    code: "GLM_STUDIO_800",
    message: "Content generation failed",
    httpStatus: 500,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 2000,
    userMessage: "Unable to generate content. Please try again",
    internalDescription: "AI content generation failed",
  },
  GLM_STUDIO_801: {
    code: "GLM_STUDIO_801",
    message: "Asset not found",
    httpStatus: 404,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Content not found",
    internalDescription: "Requested studio asset does not exist",
  },
  GLM_STUDIO_802: {
    code: "GLM_STUDIO_802",
    message: "Topic exhausted",
    httpStatus: 400,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage:
      "All topics for this category have been used. Try a different category",
    internalDescription: "No more unique topics available in category",
  },
  GLM_STUDIO_803: {
    code: "GLM_STUDIO_803",
    message: "Calendar slot unavailable",
    httpStatus: 409,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "This time slot is already taken",
    internalDescription: "Calendar slot already has content scheduled",
  },
  GLM_STUDIO_804: {
    code: "GLM_STUDIO_804",
    message: "Invalid content format",
    httpStatus: 400,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Content format not supported",
    internalDescription: "Content type/format validation failed",
  },
  GLM_STUDIO_805: {
    code: "GLM_STUDIO_805",
    message: "Content approval failed",
    httpStatus: 500,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 500,
    userMessage: "Unable to approve content. Please try again",
    internalDescription: "Database error while updating content status",
  },
} as const;

// ============================================================
// System & Infrastructure Errors (GLM_SYS_900-999)
// ============================================================

export const SYSTEM_ERRORS = {
  GLM_SYS_900: {
    code: "GLM_SYS_900",
    message: "Internal server error",
    httpStatus: 500,
    severity: "critical" as ErrorSeverity,
    recoveryStrategy: "escalate" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Something went wrong. Please try again",
    internalDescription: "Unhandled internal server error",
  },
  GLM_SYS_901: {
    code: "GLM_SYS_901",
    message: "Service unavailable",
    httpStatus: 503,
    severity: "critical" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 3,
    retryDelayMs: 5000,
    userMessage: "Service temporarily unavailable. Please try again later",
    internalDescription: "System is under maintenance or experiencing issues",
  },
  GLM_SYS_902: {
    code: "GLM_SYS_902",
    message: "Rate limit exceeded",
    httpStatus: 429,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "queue" as RecoveryStrategy,
    retryable: true,
    maxRetries: 1,
    retryDelayMs: 60000,
    userMessage: "Too many requests. Please slow down",
    internalDescription: "Global rate limit exceeded",
  },
  GLM_SYS_903: {
    code: "GLM_SYS_903",
    message: "Invalid request",
    httpStatus: 400,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "Invalid request. Please check your input",
    internalDescription: "Request payload failed schema validation",
  },
  GLM_SYS_904: {
    code: "GLM_SYS_904",
    message: "Method not allowed",
    httpStatus: 405,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "This action is not supported",
    internalDescription: "HTTP method not supported for endpoint",
  },
  GLM_SYS_905: {
    code: "GLM_SYS_905",
    message: "Configuration error",
    httpStatus: 500,
    severity: "critical" as ErrorSeverity,
    recoveryStrategy: "escalate" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "System configuration error. Our team has been notified",
    internalDescription: "Missing or invalid environment configuration",
  },
  GLM_SYS_906: {
    code: "GLM_SYS_906",
    message: "Cron job failed",
    httpStatus: 500,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 5000,
    userMessage: "Background process failed",
    internalDescription: "Scheduled cron job execution failed",
  },
  GLM_SYS_907: {
    code: "GLM_SYS_907",
    message: "Circuit breaker open",
    httpStatus: 503,
    severity: "high" as ErrorSeverity,
    recoveryStrategy: "degrade" as RecoveryStrategy,
    retryable: true,
    maxRetries: 1,
    retryDelayMs: 30000,
    userMessage: "Service is recovering. Please try again in a moment",
    internalDescription: "Circuit breaker is open due to repeated failures",
  },
  GLM_SYS_908: {
    code: "GLM_SYS_908",
    message: "Request timeout",
    httpStatus: 408,
    severity: "medium" as ErrorSeverity,
    recoveryStrategy: "retry" as RecoveryStrategy,
    retryable: true,
    maxRetries: 2,
    retryDelayMs: 1000,
    userMessage: "Request timed out. Please try again",
    internalDescription: "Request exceeded timeout threshold",
  },
  GLM_SYS_909: {
    code: "GLM_SYS_909",
    message: "Feature disabled",
    httpStatus: 403,
    severity: "low" as ErrorSeverity,
    recoveryStrategy: "ignore" as RecoveryStrategy,
    retryable: false,
    maxRetries: 0,
    retryDelayMs: 0,
    userMessage: "This feature is currently unavailable",
    internalDescription: "Feature flag is disabled",
  },
} as const;

// ============================================================
// Combined Error Catalog
// ============================================================

export const ERROR_CATALOG = {
  ...AUTH_ERRORS,
  ...USER_ERRORS,
  ...DATA_ERRORS,
  ...API_ERRORS,
  ...PAYMENT_ERRORS,
  ...MISSION_ERRORS,
  ...BRAIN_ERRORS,
  ...SCRAPE_ERRORS,
  ...STUDIO_ERRORS,
  ...SYSTEM_ERRORS,
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOG;

/**
 * Get error definition by code
 */
export function getErrorDefinition(code: ErrorCode): ErrorCodeDefinition {
  return ERROR_CATALOG[code];
}

/**
 * Check if error code is retryable
 */
export function isRetryable(code: ErrorCode): boolean {
  return ERROR_CATALOG[code].retryable;
}

/**
 * Get HTTP status for error code
 */
export function getHttpStatus(code: ErrorCode): number {
  return ERROR_CATALOG[code].httpStatus;
}

/**
 * Get user-friendly message for error code
 */
export function getUserMessage(code: ErrorCode): string {
  return ERROR_CATALOG[code].userMessage;
}

/**
 * Get recovery strategy for error code
 */
export function getRecoveryStrategy(code: ErrorCode): RecoveryStrategy {
  return ERROR_CATALOG[code].recoveryStrategy;
}
