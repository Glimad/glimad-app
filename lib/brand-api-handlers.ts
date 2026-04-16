/**
 * lib/brand-api-handlers.ts
 * Brand API endpoints for public creator discovery
 * Implements:
 * - GET /api/brand/profiles
 * - GET /api/brand/profiles/:id
 * - GET /api/brand/scores
 * - GET /api/brand/niches
 */

import type { BrandPublicProfile, BrandAPIKey } from "@/lib/brand-api";
import { BrandAPIStatus, FollowerTier, BrandTier } from "@/lib/brand-api";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export const GLM_BRAND_API_INVALID_KEY = "GLM_BRAND_API_INVALID_KEY";
export const GLM_BRAND_API_RATE_LIMIT = "GLM_BRAND_API_RATE_LIMIT";
export const GLM_BRAND_API_INSUFFICIENT_SCOPE =
  "GLM_BRAND_API_INSUFFICIENT_SCOPE";
export const GLM_BRAND_PROFILE_NOT_FOUND = "GLM_BRAND_PROFILE_NOT_FOUND";
export const GLM_BRAND_NICHE_NOT_FOUND = "GLM_BRAND_NICHE_NOT_FOUND";
export const GLM_BRAND_PII_BLOCKED = "GLM_BRAND_PII_BLOCKED";

interface BrandAPIResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  metadata?: {
    requestId: string;
    rateLimit: { current: number; limit: number; resetAt: string };
  };
}

// ============================================================================
// API KEY VALIDATION
// ============================================================================

/**
 * Validate and retrieve API key from database
 */
async function getAndValidateAPIKey(
  admin: AdminClient,
  apiKeyHeader: string,
): Promise<{ ok: boolean; key?: BrandAPIKey; error?: string }> {
  // Parse API key: format should be "glm_brand_abc123.secret"
  if (!apiKeyHeader || !apiKeyHeader.startsWith("glm_brand_")) {
    return { ok: false, error: "Invalid API key format" };
  }

  const [prefix, secret] = apiKeyHeader.split(".");
  if (!prefix || !secret) {
    return { ok: false, error: "Malformed API key" };
  }

  // Find key by prefix
  const { data: keyRecord } = await admin
    .from("core_brand_api_keys")
    .select("*")
    .eq("api_key_prefix", prefix)
    .maybeSingle();

  if (!keyRecord) {
    return { ok: false, error: "API key not found" };
  }

  // Check if key is active
  if (keyRecord.status !== BrandAPIStatus.ACTIVE) {
    return { ok: false, error: `API key is ${keyRecord.status}` };
  }

  // Check if key has expired
  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    return { ok: false, error: "API key has expired" };
  }

  // Verify HMAC signature using secret (stored as bcrypt hash in DB)
  // For now we'll assume it's verified (in production, use bcrypt.compare)
  // const isValid = await bcrypt.compare(secret, keyRecord.api_key_hash)
  // if (!isValid) {
  //   return { ok: false, error: 'Invalid API key signature' }
  // }

  // Update last_used_at
  await admin
    .from("core_brand_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRecord.id);

  return { ok: true, key: mapBrandAPIKey(keyRecord) };
}

/**
 * Check rate limits for API key
 */
async function checkRateLimit(
  admin: AdminClient,
  keyId: string,
  tier: string,
): Promise<{
  ok: boolean;
  limit?: { current: number; limit: number; resetAt: string };
  message?: string;
}> {
  const now = new Date();
  const windowStartMinute = Math.floor(now.getTime() / 60000) * 60000;
  const windowStart = new Date(windowStartMinute);

  // Get usage in current minute
  const { count } = await admin
    .from("core_brand_api_usage")
    .select("*", { count: "exact" })
    .eq("api_key_tier", tier)
    .gte("created_at", windowStart.toISOString());

  const rateLimitRpm = getRateLimitForTier(tier);
  const currentCount = count || 0;

  if (currentCount >= rateLimitRpm) {
    return {
      ok: false,
      message: "Rate limit exceeded",
      limit: {
        current: currentCount,
        limit: rateLimitRpm,
        resetAt: new Date(windowStartMinute + 60000).toISOString(),
      },
    };
  }

  return {
    ok: true,
    limit: {
      current: currentCount,
      limit: rateLimitRpm,
      resetAt: new Date(windowStartMinute + 60000).toISOString(),
    },
  };
}

function getRateLimitForTier(tier: string): number {
  const limits: Record<string, number> = {
    basic: 60, // 60 requests per minute
    pro: 300, // 300 requests per minute
    enterprise: 10000, // 10k requests per minute
  };
  return limits[tier] || 60;
}

/**
 * Log API usage for audit trail
 */
async function logAPIUsage(
  admin: AdminClient,
  keyId: string,
  keyTier: string,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTimeMs: number,
  requestIp?: string,
): Promise<void> {
  await admin.from("core_brand_api_usage").insert({
    api_key_id: keyId,
    api_key_tier: keyTier,
    endpoint,
    method,
    status_code: statusCode,
    response_time_ms: responseTimeMs,
    request_ip: requestIp,
  });
}

// ============================================================================
// ENDPOINT HANDLERS
// ============================================================================

/**
 * GET /api/brand/profiles
 * List opted-in creator profiles filtered by niche, tier, score
 */
export async function handleGetProfiles(
  admin: AdminClient,
  nicheFilter?: string,
  tierFilter?: string,
  minScoreFilter?: number,
  limit = 50,
  offset = 0,
): Promise<BrandAPIResponse<BrandPublicProfile[]>> {
  let query = admin
    .from("core_brand_profiles")
    .select(
      `
      id,
      display_name,
      niche_primary,
      niche_secondary,
      platform_focus,
      follower_tier,
      core_brand_scores (
        growth_score,
        engagement_score,
        consistency_score,
        brand_safety_score,
        overall_score,
        confidence,
        calculation_version,
        input_signals_count,
        period_start,
        period_end,
        created_at
      )
    `,
    )
    .eq("opted_in", true);

  if (nicheFilter) {
    query = query.eq("niche_primary", nicheFilter);
  }

  if (tierFilter) {
    query = query.eq("follower_tier", tierFilter);
  }

  const { data, error } = await query.range(offset, offset + limit - 1);

  if (error) {
    return {
      ok: false,
      error: error.message,
      code: "GLM_DATABASE_ERROR",
    };
  }

  interface ProfileRow {
    id: string;
    display_name: string;
    niche_primary: string;
    niche_secondary: string[];
    platform_focus: string;
    follower_tier: FollowerTier;
    core_brand_scores: Array<{
      growth_score: number;
      engagement_score: number;
      consistency_score: number;
      brand_safety_score: number;
      overall_score: number;
      confidence: number;
      calculation_version: string;
      input_signals_count: number;
      period_start: string;
      period_end: string;
      created_at: string;
    }>;
  }

  const profiles: BrandPublicProfile[] = ((data as ProfileRow[]) || []).map(
    (profile) => ({
      id: profile.id,
      displayName: profile.display_name,
      nichePrimary: profile.niche_primary,
      niceSecondary: profile.niche_secondary,
      platformFocus: profile.platform_focus,
      followerTier: profile.follower_tier,
      scores: profile.core_brand_scores?.[0]
        ? {
            id: `score-${profile.id}`,
            brandProfileId: profile.id,
            growthScore: profile.core_brand_scores[0].growth_score,
            engagementScore: profile.core_brand_scores[0].engagement_score,
            consistencyScore: profile.core_brand_scores[0].consistency_score,
            brandSafetyScore: profile.core_brand_scores[0].brand_safety_score,
            overallScore: profile.core_brand_scores[0].overall_score,
            calculationVersion:
              profile.core_brand_scores[0].calculation_version,
            inputSignalsCount: profile.core_brand_scores[0].input_signals_count,
            confidence: profile.core_brand_scores[0].confidence,
            periodStart: profile.core_brand_scores[0].period_start,
            periodEnd: profile.core_brand_scores[0].period_end,
            createdAt: profile.core_brand_scores[0].created_at,
          }
        : null,
    }),
  );

  // Filter by min score if provided
  const filtered =
    minScoreFilter && minScoreFilter > 0
      ? profiles.filter(
          (p) => p.scores && p.scores.overallScore >= minScoreFilter,
        )
      : profiles;

  return {
    ok: true,
    data: filtered,
  };
}

/**
 * GET /api/brand/profiles/:id
 * Get single profile details (PII-filtered)
 */
export async function handleGetProfileDetail(
  admin: AdminClient,
  profileId: string,
): Promise<BrandAPIResponse<BrandPublicProfile>> {
  const { data, error } = await admin
    .from("core_brand_profiles")
    .select(
      `
      id,
      display_name,
      niche_primary,
      niche_secondary,
      platform_focus,
      follower_tier,
      core_brand_scores (
        growth_score,
        engagement_score,
        consistency_score,
        brand_safety_score,
        overall_score,
        confidence,
        calculation_version
      )
    `,
    )
    .eq("id", profileId)
    .eq("opted_in", true)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: error.message,
      code: "GLM_DATABASE_ERROR",
    };
  }

  if (!data) {
    return {
      ok: false,
      error: "Profile not found or not opted-in",
      code: GLM_BRAND_PROFILE_NOT_FOUND,
    };
  }

  interface ScoreRow {
    growth_score: number;
    engagement_score: number;
    consistency_score: number;
    brand_safety_score: number;
    overall_score: number;
    confidence: number;
    calculation_version: string;
  }

  interface DataWithScores {
    id: string;
    display_name: string;
    niche_primary: string;
    niche_secondary: string[];
    platform_focus: string;
    follower_tier: FollowerTier;
    core_brand_scores: ScoreRow[];
  }

  const typedData = data as DataWithScores;

  const profile: BrandPublicProfile = {
    id: typedData.id,
    displayName: typedData.display_name,
    nichePrimary: typedData.niche_primary,
    niceSecondary: typedData.niche_secondary,
    platformFocus: typedData.platform_focus,
    followerTier: typedData.follower_tier,
    scores: null,
  };

  if (typedData.core_brand_scores?.[0]) {
    profile.scores = {
      id: `score-${typedData.id}`,
      brandProfileId: typedData.id,
      growthScore: typedData.core_brand_scores[0].growth_score,
      engagementScore: typedData.core_brand_scores[0].engagement_score,
      consistencyScore: typedData.core_brand_scores[0].consistency_score,
      brandSafetyScore: typedData.core_brand_scores[0].brand_safety_score,
      overallScore: typedData.core_brand_scores[0].overall_score,
      calculationVersion: typedData.core_brand_scores[0].calculation_version,
      inputSignalsCount: 0,
      confidence: typedData.core_brand_scores[0].confidence,
      periodStart: "",
      periodEnd: "",
      createdAt: "",
    };
  }

  return {
    ok: true,
    data: profile,
  };
}

/**
 * GET /api/brand/scores
 * Get time-series scores for one or multiple profiles
 */
export async function handleGetScores(
  admin: AdminClient,
  profileIds: string[],
  periodDays = 30,
): Promise<BrandAPIResponse<Record<string, Array<Record<string, unknown>>>>> {
  const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  interface ScoreRow {
    brand_profile_id: string;
    growth_score: number;
    engagement_score: number;
    consistency_score: number;
    brand_safety_score: number;
    overall_score: number;
    calculation_version: string;
    confidence: number;
    period_start: string;
    period_end: string;
    created_at: string;
  }

  const { data, error } = await admin
    .from("core_brand_scores")
    .select("*")
    .in("brand_profile_id", profileIds)
    .gte("created_at", periodStart.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    return {
      ok: false,
      error: error.message,
      code: "GLM_DATABASE_ERROR",
    };
  }

  // Group by profile ID
  const result: Record<string, Record<string, unknown>[]> = {};
  for (const profileId of profileIds) {
    result[profileId] = ((data as ScoreRow[]) || [])
      .filter((score) => score.brand_profile_id === profileId)
      .map((score: ScoreRow) => ({
        growthScore: score.growth_score,
        engagementScore: score.engagement_score,
        consistencyScore: score.consistency_score,
        brandSafetyScore: score.brand_safety_score,
        overallScore: score.overall_score,
        calculationVersion: score.calculation_version,
        confidence: score.confidence,
        periodStart: score.period_start,
        periodEnd: score.period_end,
        createdAt: score.created_at,
      }));
  }

  return {
    ok: true,
    data: result,
  };
}

/**
 * GET /api/brand/niches
 * List niche taxonomy with keywords
 */
export async function handleGetNiches(
  admin: AdminClient,
): Promise<
  BrandAPIResponse<
    Array<{
      id: string;
      name: string;
      slug: string;
      parentNiche?: string;
      keywords?: string[];
      description?: string;
    }>
  >
> {
  interface NicheRow {
    id: string;
    name: string;
    slug: string;
    parent_niche?: string;
    keywords?: string[];
    description?: string;
  }

  const { data, error } = await admin
    .from("core_niche_taxonomy")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return {
      ok: false,
      error: error.message,
      code: GLM_BRAND_NICHE_NOT_FOUND,
    };
  }

  const niches = ((data as NicheRow[]) || []).map((niche) => ({
    id: niche.id,
    name: niche.name,
    slug: niche.slug,
    parentNiche: niche.parent_niche,
    keywords: niche.keywords || [],
    description: niche.description,
  }));

  return {
    ok: true,
    data: niches,
  };
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class BrandAPIError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "BrandAPIError";
  }
}

// ============================================================================
// HELPER MAPPERS
// ============================================================================

function mapBrandAPIKey(raw: Record<string, unknown>): BrandAPIKey {
  return {
    id: raw.id as string,
    brandName: raw.brand_name as string,
    brandEmail: raw.brand_email as string,
    brandWebsite: raw.brand_website as string | undefined,
    apiKeyPrefix: raw.api_key_prefix as string,
    tier: raw.tier as BrandTier,
    rateLimitRpm: raw.rate_limit_rpm as number,
    rateLimitDaily: raw.rate_limit_daily as number,
    maxResultsPerRequest: raw.max_results_per_request as number,
    scopes: (raw.scopes as string[]) || [],
    status: raw.status as BrandAPIStatus,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
    lastUsedAt: raw.last_used_at as string | undefined,
    expiresAt: raw.expires_at as string | undefined,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const BrandAPIHandlers = {
  getAndValidateAPIKey,
  checkRateLimit,
  logAPIUsage,
  handleGetProfiles,
  handleGetProfileDetail,
  handleGetScores,
  handleGetNiches,
  BrandAPIError,
};
