/**
 * lib/brand-api.ts
 * Brand Backstage Layer - Infrastructure for B2B creator score exposure
 * Brief 8 Implementation
 *
 * - PII filtering & protection
 * - Score calculation (growth, engagement, consistency, brand_safety)
 * - Brand API key management
 * - Creator opt-in system
 */

import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// ============================================================================
// TYPES & ENUMS
// ============================================================================

export enum FollowerTier {
  NANO_0_1K = "nano_0_1k",
  NANO_1K_5K = "nano_1k_5k",
  MICRO_5K_25K = "micro_5k_25k",
  MID_25K_100K = "mid_25k_100k",
  MACRO_100K_250K = "macro_100k_250k",
  MEGA_250K_PLUS = "mega_250k_plus",
}

export enum BrandTier {
  BASIC = "basic",
  PRO = "pro",
  ENTERPRISE = "enterprise",
}

export enum BrandAPIStatus {
  PENDING = "pending",
  ACTIVE = "active",
  SUSPENDED = "suspended",
  REVOKED = "revoked",
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface BrandProfile {
  id: string;
  projectId: string;
  displayName: string;
  avatarUrl?: string;
  nichePrimary: string;
  niceSecondary: string[];
  platformFocus: "instagram" | "tiktok" | "youtube" | "linkedin" | "twitter";
  followerTier: FollowerTier;
  optedIn: boolean;
  optedInAt?: string;
  optOutAt?: string;
  profileVersion: number;
  lastScoreUpdate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrandScores {
  id: string;
  brandProfileId: string;
  growthScore: number;
  engagementScore: number;
  consistencyScore: number;
  brandSafetyScore: number;
  overallScore: number;
  calculationVersion: string;
  inputSignalsCount: number;
  confidence: number;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface BrandAPIKey {
  id: string;
  brandName: string;
  brandEmail: string;
  brandWebsite?: string;
  apiKeyPrefix: string;
  tier: BrandTier;
  rateLimitRpm: number;
  rateLimitDaily: number;
  maxResultsPerRequest: number;
  scopes: string[];
  status: BrandAPIStatus;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

export interface BrandPublicProfile {
  id: string;
  displayName: string;
  nichePrimary: string;
  niceSecondary: string[];
  platformFocus: string;
  followerTier: FollowerTier;
  scores: BrandScores | null;
}

export interface ScoreCalculationResult {
  growthScore: number;
  engagementScore: number;
  consistencyScore: number;
  brandSafetyScore: number;
  overallScore: number;
  confidence: number;
  inputSignalsCount: number;
}

// ============================================================================
// SCORE CALCULATION
// ============================================================================

/**
 * Calculate growth score (0-100)
 * Based on: follower growth 30d + view growth 30d
 * Formula: 0.6 * follower_growth + 0.4 * view_growth
 */
export function calculateGrowthScore(
  followerGrowth30d: number,
  viewsGrowth30d: number,
  initialFollowers: number,
): number {
  if (initialFollowers === 0) return 0;

  const followerGrowthPct = Math.min(
    100,
    (followerGrowth30d / initialFollowers) * 100,
  );
  const viewsGrowthNormalized = Math.min(100, Math.max(0, viewsGrowth30d));

  const score = 0.6 * followerGrowthPct + 0.4 * viewsGrowthNormalized;
  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Calculate engagement score (0-100)
 * Based on: engagement_rate + save rate + share rate
 * Formula: 0.4 * engagement_rate_percentile + 0.3 * save_rate + 0.3 * share_rate
 */
export function calculateEngagementScore(
  engagementRate: number,
  saveRate: number,
  shareRate: number,
): number {
  // Percentile conversion (typical ER is 1-5%)
  const engagementPercentile = Math.min(100, (engagementRate / 5) * 100);

  const score = 0.4 * engagementPercentile + 0.3 * saveRate + 0.3 * shareRate;
  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Calculate consistency score (0-100)
 * Based on: posting frequency + regularity + streak
 * Formula: 0.5 * frequency + 0.3 * regularity + 0.2 * streak
 */
export function calculateConsistencyScore(
  postsPerWeek: number,
  regularityScore: number, // 0-100
  streakDays: number,
): number {
  // Frequency: up to 7 posts per week = 100
  const frequencyScore = Math.min(100, (postsPerWeek / 7) * 100);

  // Streak: every 30 days = 10 points, max 100
  const streakScore = Math.min(100, (streakDays / 30) * 10);

  const score =
    0.5 * frequencyScore + 0.3 * regularityScore + 0.2 * streakScore;
  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Calculate brand safety score (0-100)
 * Based on: content pillars + moderation flags
 * Formula: 100 - (controversy_flags * 10 + policy_violations * 25)
 */
export function calculateBrandSafetyScore(
  controversyFlagsCount: number,
  policyViolationsCount: number,
  hasExplicitContent: boolean,
): number {
  let deduction = controversyFlagsCount * 10 + policyViolationsCount * 25;

  if (hasExplicitContent) {
    deduction += 30;
  }

  const score = Math.max(0, 100 - deduction);
  return Math.round(Math.min(100, score));
}

/**
 * Calculate overall composite score
 * Formula: 0.25 * growth + 0.35 * engagement + 0.25 * consistency + 0.15 * brand_safety
 */
export function calculateOverallScore(
  growthScore: number,
  engagementScore: number,
  consistencyScore: number,
  brandSafetyScore: number,
): number {
  const score =
    growthScore * 0.25 +
    engagementScore * 0.35 +
    consistencyScore * 0.25 +
    brandSafetyScore * 0.15;

  return Math.round(score);
}

/**
 * Calculate confidence based on signal count
 * 1 signal = 0.1 confidence
 * 30+ signals = 1.0 confidence
 */
export function calculateConfidence(signalCount: number): number {
  return Math.min(1.0, signalCount / 30);
}

// ============================================================================
// BRAND PROFILE MANAGEMENT
// ============================================================================

/**
 * Create brand profile for a creator (after signup)
 */
export async function createBrandProfile(
  admin: AdminClient,
  projectId: string,
  projectName: string,
  nichePrimary: string,
  platformFocus: string,
): Promise<BrandProfile> {
  const { data, error } = await admin
    .from("core_brand_profiles")
    .insert({
      project_id: projectId,
      display_name: projectName,
      niche_primary: nichePrimary,
      niche_secondary: [],
      platform_focus: platformFocus,
      follower_tier: "nano_0_1k", // default
      opted_in: false,
      profile_version: 1,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create brand profile: ${error?.message}`);
  }

  return mapBrandProfile(data);
}

/**
 * Handle creator opt-in to brand discovery
 */
export async function optInCreator(
  admin: AdminClient,
  projectId: string,
  consentVersion = "v1",
): Promise<void> {
  const { error } = await admin
    .from("core_brand_profiles")
    .update({
      opted_in: true,
      opted_in_at: new Date().toISOString(),
      consent_version: consentVersion,
    })
    .eq("project_id", projectId);

  if (error) {
    throw new Error(`Failed to opt-in creator: ${error.message}`);
  }
}

/**
 * Handle creator opt-out from brand discovery
 */
export async function optOutCreator(
  admin: AdminClient,
  projectId: string,
): Promise<void> {
  const { error } = await admin
    .from("core_brand_profiles")
    .update({
      opted_in: false,
      opt_out_at: new Date().toISOString(),
    })
    .eq("project_id", projectId);

  if (error) {
    throw new Error(`Failed to opt-out creator: ${error.message}`);
  }
}

/**
 * Update follower tier based on follower count
 */
export async function updateFollowerTier(
  admin: AdminClient,
  projectId: string,
  followerCount: number,
): Promise<FollowerTier> {
  let tier: FollowerTier;

  if (followerCount < 1000) tier = FollowerTier.NANO_0_1K;
  else if (followerCount < 5000) tier = FollowerTier.NANO_1K_5K;
  else if (followerCount < 25000) tier = FollowerTier.MICRO_5K_25K;
  else if (followerCount < 100000) tier = FollowerTier.MID_25K_100K;
  else if (followerCount < 250000) tier = FollowerTier.MACRO_100K_250K;
  else tier = FollowerTier.MEGA_250K_PLUS;

  const { error } = await admin
    .from("core_brand_profiles")
    .update({ follower_tier: tier })
    .eq("project_id", projectId);

  if (error) {
    throw new Error(`Failed to update follower tier: ${error.message}`);
  }

  return tier;
}

// ============================================================================
// SCORE CALCULATION & AGGREGATION
// ============================================================================

/**
 * Calculate and upsert brand scores for a creator
 */
export async function calculateAndUpsertBrandScores(
  admin: AdminClient,
  brandProfileId: string,
  projectId: string,
): Promise<BrandScores> {
  // Get brain data and signals
  const { data: brainData } = await admin
    .from("brain_snapshots")
    .select("facts")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: signals } = await admin
    .from("brain_signals")
    .select("*")
    .eq("project_id", projectId)
    .gte(
      "observed_at",
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    );

  // Default values
  const facts = brainData?.facts || {};
  const signalCount = signals?.length ?? 0;

  const followerGrowth =
    (facts?.["metrics.follower_growth_30d"] as number) ?? 0;
  const viewsGrowth = (facts?.["metrics.views_30d"] as number) ?? 0;
  const initialFollowers = (facts?.["metrics.follower_count"] as number) ?? 1;
  const engagementRate =
    (facts?.["metrics.engagement_rate_30d"] as number) ?? 0;
  const saveRate = (facts?.["metrics.save_rate"] as number) ?? 0;
  const shareRate = (facts?.["metrics.share_rate"] as number) ?? 0;
  const postsPerWeek = (facts?.["metrics.posts_per_week"] as number) ?? 0;
  const regularityScore = (facts?.["metrics.regularity_score"] as number) ?? 50;
  const streakDays = (facts?.["metrics.streak_days"] as number) ?? 0;
  const controversyFlags =
    (facts?.["content.controversy_flags"] as number) ?? 0;
  const policyViolations =
    (facts?.["content.policy_violations"] as number) ?? 0;
  const hasExplicitContent =
    (facts?.["content.has_explicit"] as boolean) ?? false;

  // Calculate scores
  const growthScore = calculateGrowthScore(
    followerGrowth,
    viewsGrowth,
    initialFollowers,
  );
  const engagementScore = calculateEngagementScore(
    engagementRate,
    saveRate,
    shareRate,
  );
  const consistencyScore = calculateConsistencyScore(
    postsPerWeek,
    regularityScore,
    streakDays,
  );
  const brandSafetyScore = calculateBrandSafetyScore(
    controversyFlags,
    policyViolations,
    hasExplicitContent,
  );
  const overallScore = calculateOverallScore(
    growthScore,
    engagementScore,
    consistencyScore,
    brandSafetyScore,
  );
  const confidence = calculateConfidence(signalCount);

  // Upsert scores
  const now = new Date();
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const { data, error } = await admin
    .from("core_brand_scores")
    .insert({
      brand_profile_id: brandProfileId,
      growth_score: growthScore,
      engagement_score: engagementScore,
      consistency_score: consistencyScore,
      brand_safety_score: brandSafetyScore,
      overall_score: overallScore,
      calculation_version: "v1",
      input_signals_count: signalCount,
      confidence: confidence.toFixed(2),
      period_start: periodStart.toISOString().split("T")[0],
      period_end: now.toISOString().split("T")[0],
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert brand scores: ${error?.message}`);
  }

  return mapBrandScores(data);
}

/**
 * Cron job: Daily aggregation of brand scores for opted-in creators
 * Runs at 03:00 UTC
 */
export async function aggregateAllBrandScores(
  admin: AdminClient,
): Promise<void> {
  const { data: optedInProfiles, error: profileError } = await admin
    .from("core_brand_profiles")
    .select("id, project_id")
    .eq("opted_in", true);

  if (profileError) {
    throw new Error(
      `Failed to fetch opted-in profiles: ${profileError.message}`,
    );
  }

  if (!optedInProfiles || optedInProfiles.length === 0) {
    return;
  }

  const startTime = Date.now();
  let updated = 0;
  let errors = 0;

  for (const profile of optedInProfiles) {
    try {
      await calculateAndUpsertBrandScores(
        admin,
        profile.id,
        profile.project_id,
      );
      updated++;
    } catch (err) {
      console.error(`Failed to update scores for profile ${profile.id}:`, err);
      errors++;
    }
  }

  // Log aggregation run
  const executionTimeMs = Date.now() - startTime;
  await admin.from("core_brand_score_runs").insert({
    run_date: new Date().toISOString().split("T")[0],
    total_profiles_processed: optedInProfiles.length,
    profiles_updated: updated,
    calculation_version: "v1",
    errors_count: errors,
    execution_time_ms: executionTimeMs,
    status: errors === 0 ? "success" : "partial_failure",
  });
}

// ============================================================================
// PII PROTECTION
// ============================================================================

/**
 * Filter brand profile for public API exposure
 * Removes all PII
 */
export function sanitizeForBrandAPI(
  profile: BrandProfile,
  scores: BrandScores | null,
): BrandPublicProfile {
  return {
    id: profile.id,
    displayName: profile.displayName,
    nichePrimary: profile.nichePrimary,
    niceSecondary: profile.niceSecondary,
    platformFocus: profile.platformFocus,
    followerTier: profile.followerTier,
    scores,
  };
}

/**
 * List of fields that should NEVER be exposed via Brand API
 */
export const BLOCKED_FIELDS = new Set([
  "user_id",
  "project_id",
  "email",
  "password",
  "stripe_customer_id",
  "api_key",
  "auth_token",
  "full_handle",
  "phone",
  "physical_address",
  "payment_method",
  "stripe_event_id",
]);

/**
 * Audit PII access attempts
 */
export async function auditPIIAccessAttempt(
  admin: AdminClient,
  apiKeyId: string,
  attemptedTable: string,
  attemptedFields: string[],
  action: "denied" | "allowed_filtered",
  reason: string,
  requestIp?: string,
): Promise<void> {
  await admin.from("core_brand_pii_audit").insert({
    api_key_id: apiKeyId,
    attempted_table: attemptedTable,
    attempted_fields: attemptedFields,
    action,
    reason,
    request_ip: requestIp,
  });
}

// ============================================================================
// HELPER MAPPERS
// ============================================================================

function mapBrandProfile(raw: Record<string, unknown>): BrandProfile {
  return {
    id: raw.id as string,
    projectId: raw.project_id as string,
    displayName: raw.display_name as string,
    avatarUrl: raw.avatar_url as string | undefined,
    nichePrimary: raw.niche_primary as string,
    niceSecondary: (raw.niche_secondary as string[]) || [],
    platformFocus: raw.platform_focus as
      | "instagram"
      | "tiktok"
      | "youtube"
      | "linkedin"
      | "twitter",
    followerTier: raw.follower_tier as FollowerTier,
    optedIn: raw.opted_in as boolean,
    optedInAt: raw.opted_in_at as string | undefined,
    optOutAt: raw.opt_out_at as string | undefined,
    profileVersion: raw.profile_version as number,
    lastScoreUpdate: raw.last_score_update as string | undefined,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

function mapBrandScores(raw: Record<string, unknown>): BrandScores {
  return {
    id: raw.id as string,
    brandProfileId: raw.brand_profile_id as string,
    growthScore: raw.growth_score as number,
    engagementScore: raw.engagement_score as number,
    consistencyScore: raw.consistency_score as number,
    brandSafetyScore: raw.brand_safety_score as number,
    overallScore: raw.overall_score as number,
    calculationVersion: raw.calculation_version as string,
    inputSignalsCount: raw.input_signals_count as number,
    confidence: parseFloat(raw.confidence as string),
    periodStart: raw.period_start as string,
    periodEnd: raw.period_end as string,
    createdAt: raw.created_at as string,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const BrandAPI = {
  // Profile management
  createBrandProfile,
  optInCreator,
  optOutCreator,
  updateFollowerTier,

  // Score calculation
  calculateAndUpsertBrandScores,
  aggregateAllBrandScores,
  calculateGrowthScore,
  calculateEngagementScore,
  calculateConsistencyScore,
  calculateBrandSafetyScore,
  calculateOverallScore,
  calculateConfidence,

  // PII protection
  sanitizeForBrandAPI,
  auditPIIAccessAttempt,
  BLOCKED_FIELDS,
};
