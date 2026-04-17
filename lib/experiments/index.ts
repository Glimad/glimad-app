/**
 * lib/experiments/index.ts
 * Brief 15: Experiments & Analytics Registry
 *
 * Full implementation: create/run/complete experiments, winner selection,
 * learning generation, performance winners materialisation, analytics events.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Experiment,
  ExperimentVariant,
  ExperimentItem,
  Learning,
  PerformanceWinner,
  PostMetrics,
  CreateExperimentInput,
  AddExperimentItemInput,
  WinnerSelectionResult,
  AnalyticsEventType,
} from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

// ============================================================================
// DERIVED METRICS CALCULATOR
// ============================================================================

export function computeDerivedMetrics(raw: Partial<PostMetrics>): PostMetrics {
  const views = raw.views ?? 0;
  const likes = raw.likes ?? 0;
  const comments = raw.comments ?? 0;
  const shares = raw.shares ?? 0;
  const saves = raw.saves ?? 0;
  const follows = raw.follows_from_post ?? 0;
  const clicks = raw.clicks ?? 0;

  const engagement_rate =
    views > 0 ? (likes + comments + shares + saves) / views : 0;

  return {
    views,
    likes,
    comments,
    shares,
    saves,
    profile_visits: raw.profile_visits ?? 0,
    follows_from_post: follows,
    clicks,
    watch_time_sec_avg: raw.watch_time_sec_avg ?? null,
    engagement_rate,
    save_rate: views > 0 ? saves / views : 0,
    follow_rate: views > 0 ? follows / views : 0,
    click_rate: views > 0 ? clicks / views : 0,
  };
}

// ============================================================================
// EXPERIMENTS CRUD
// ============================================================================

/**
 * Create a new experiment with its variants.
 * Returns the experiment_id.
 */
export async function createExperiment(
  admin: AdminClient,
  input: CreateExperimentInput,
): Promise<string> {
  // Idempotency check
  if (input.idempotency_key) {
    const { data: existing } = await admin
      .from("core_experiments")
      .select("experiment_id")
      .eq("project_id", input.project_id)
      .eq("idempotency_key", input.idempotency_key)
      .single();
    if (existing) return existing.experiment_id as string;
  }

  const { data: exp, error } = await admin
    .from("core_experiments")
    .insert({
      project_id: input.project_id,
      status: "planned",
      hypothesis: input.hypothesis,
      experiment_type: input.experiment_type,
      platform_scope: input.platform_scope ?? "focus",
      metric_primary: input.metric_primary,
      metric_secondary: input.metric_secondary ?? null,
      timeframe_days: input.timeframe_days,
      success_criteria: input.success_criteria,
      baseline_json: input.baseline_json ?? null,
      idempotency_key: input.idempotency_key ?? null,
      notes: input.notes ?? "",
    })
    .select("experiment_id")
    .single();

  if (error || !exp)
    throw new Error(`Failed to create experiment: ${error?.message}`);

  const expId = exp.experiment_id as string;

  // Insert variants
  if (input.variants.length > 0) {
    const variantRows = input.variants.map((v) => ({
      experiment_id: expId,
      variant_key: v.variant_key,
      variant_name: v.variant_name,
      spec_json: v.spec_json,
    }));
    await admin.from("core_experiment_variants").insert(variantRows);
  }

  return expId;
}

/**
 * Start an experiment (status: planned → running).
 */
export async function startExperiment(
  admin: AdminClient,
  experimentId: string,
  projectId: string,
): Promise<void> {
  await admin
    .from("core_experiments")
    .update({
      status: "running",
      start_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("experiment_id", experimentId)
    .eq("project_id", projectId);
}

/**
 * Get experiment with variants.
 */
export async function getExperiment(
  admin: AdminClient,
  experimentId: string,
  projectId: string,
): Promise<{ experiment: Experiment; variants: ExperimentVariant[] } | null> {
  const { data: exp } = await admin
    .from("core_experiments")
    .select("*")
    .eq("experiment_id", experimentId)
    .eq("project_id", projectId)
    .single();

  if (!exp) return null;

  const { data: variants } = await admin
    .from("core_experiment_variants")
    .select("*")
    .eq("experiment_id", experimentId)
    .order("variant_key", { ascending: true });

  return {
    experiment: exp as Experiment,
    variants: (variants ?? []) as ExperimentVariant[],
  };
}

/**
 * List experiments for a project.
 */
export async function listExperiments(
  admin: AdminClient,
  projectId: string,
  status?: string,
): Promise<Experiment[]> {
  let query = admin
    .from("core_experiments")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data } = await query;
  return (data ?? []) as Experiment[];
}

// ============================================================================
// EXPERIMENT ITEMS (evidence)
// ============================================================================

/**
 * Add a calendar item as evidence for a variant.
 */
export async function addExperimentItem(
  admin: AdminClient,
  input: AddExperimentItemInput,
): Promise<string> {
  const metrics = input.metrics ? computeDerivedMetrics(input.metrics) : null;

  const { data, error } = await admin
    .from("core_experiment_items")
    .upsert(
      {
        experiment_id: input.experiment_id,
        variant_id: input.variant_id,
        calendar_item_id: input.calendar_item_id,
        asset_id: input.asset_id ?? null,
        published_at: input.published_at ?? null,
        metrics_json: metrics,
        source: input.source ?? "manual",
        confidence: input.confidence ?? 0.7,
      },
      { onConflict: "variant_id,calendar_item_id" },
    )
    .select("experiment_item_id")
    .single();

  if (error || !data) throw new Error(`Failed to add item: ${error?.message}`);
  return data.experiment_item_id as string;
}

/**
 * Update metrics for an existing experiment item (after scrape).
 */
export async function updateItemMetrics(
  admin: AdminClient,
  experimentItemId: string,
  metrics: Partial<PostMetrics>,
  source: "scrape" | "manual" | "mixed" = "scrape",
  confidence = 0.9,
): Promise<void> {
  const computed = computeDerivedMetrics(metrics);
  await admin
    .from("core_experiment_items")
    .update({
      metrics_json: computed,
      source,
      confidence,
    })
    .eq("experiment_item_id", experimentItemId);
}

/**
 * Get all items for an experiment.
 */
export async function getExperimentItems(
  admin: AdminClient,
  experimentId: string,
): Promise<ExperimentItem[]> {
  const { data } = await admin
    .from("core_experiment_items")
    .select("*")
    .eq("experiment_id", experimentId)
    .order("published_at", { ascending: true });

  return (data ?? []) as ExperimentItem[];
}

// ============================================================================
// WINNER SELECTION
// ============================================================================

/**
 * Close an experiment and determine the winner.
 * Generates learnings and updates the performance_winners table.
 */
export async function completeExperiment(
  admin: AdminClient,
  experimentId: string,
  projectId: string,
): Promise<WinnerSelectionResult> {
  const result = await getExperiment(admin, experimentId, projectId);
  if (!result) throw new Error("Experiment not found");

  const { experiment, variants } = result;
  const items = await getExperimentItems(admin, experimentId);

  const criteria = experiment.success_criteria;
  const primaryMetric = experiment.metric_primary;

  // Group items by variant
  const byVariant: Record<string, ExperimentItem[]> = {};
  for (const item of items) {
    if (!byVariant[item.variant_id]) byVariant[item.variant_id] = [];
    byVariant[item.variant_id].push(item);
  }

  // Check minimum samples
  const sufficientSamples = variants.every(
    (v) =>
      (byVariant[v.variant_id]?.length ?? 0) >= (criteria.min_samples ?? 1),
  );

  // Calculate avg primary metric per variant
  const metricsByVariant: Record<string, number> = {};
  for (const variant of variants) {
    const variantItems = byVariant[variant.variant_id] ?? [];
    const values = variantItems
      .map((item) => extractMetricValue(item.metrics_json, primaryMetric))
      .filter((v): v is number => v !== null);

    metricsByVariant[variant.variant_id] =
      values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  let winnerVariantId: string | null = null;
  let winnerVariantKey: string | null = null;
  let reason = "No winner determined";
  let liftVsBaseline: number | null = null;

  if (!sufficientSamples) {
    reason = `Insufficient samples (min ${criteria.min_samples} per variant)`;
    await admin
      .from("core_experiments")
      .update({
        status: "invalidated",
        end_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("experiment_id", experimentId);
  } else {
    // Find winner (highest primary metric)
    const sorted = Object.entries(metricsByVariant).sort(
      ([, a], [, b]) => b - a,
    );
    const [topVariantId, topValue] = sorted[0] ?? [null, 0];

    // Check minimum lift if baseline exists
    const baseline = experiment.baseline_json as Record<string, unknown> | null;
    if (baseline && criteria.min_lift_percent) {
      const baselineValue = extractBaselineValue(baseline, primaryMetric);
      if (baselineValue !== null && baselineValue > 0) {
        liftVsBaseline = ((topValue - baselineValue) / baselineValue) * 100;
        if (liftVsBaseline < criteria.min_lift_percent) {
          reason = `Winner lift (${liftVsBaseline.toFixed(1)}%) below threshold (${criteria.min_lift_percent}%)`;
          if (topVariantId) winnerVariantId = null;
        }
      }
    }

    if (
      topVariantId &&
      (liftVsBaseline === null ||
        liftVsBaseline >= (criteria.min_lift_percent ?? 0))
    ) {
      winnerVariantId = topVariantId;
      const winnerVariant = variants.find((v) => v.variant_id === topVariantId);
      winnerVariantKey = winnerVariant?.variant_key ?? null;
      reason = `Winner: variant ${winnerVariantKey} with ${primaryMetric}=${topValue.toFixed(4)}`;
    }

    await admin
      .from("core_experiments")
      .update({
        status: "completed",
        end_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("experiment_id", experimentId);
  }

  // Generate learnings
  const learningIds: string[] = [];

  if (winnerVariantId) {
    const winnerVariant = variants.find(
      (v) => v.variant_id === winnerVariantId,
    );
    const learningId = await createLearning(admin, {
      project_id: projectId,
      learning_type: "winner",
      title: `Winner: ${winnerVariant?.variant_name ?? winnerVariantKey}`,
      description: reason,
      applies_to: {},
      evidence_refs: { experiment_ids: [experimentId] },
      strength: Math.min(
        100,
        Math.round((metricsByVariant[winnerVariantId] ?? 0) * 1000),
      ),
    });
    learningIds.push(learningId);

    // Materialise performance winner
    if (winnerVariant) {
      await upsertPerformanceWinner(admin, {
        project_id: projectId,
        platform: experiment.platform_scope,
        winner_category: mapTypeToCategory(experiment.experiment_type),
        winner_key: `${experiment.experiment_type}_${winnerVariant.variant_key}`,
        summary: winnerVariant.variant_name,
        avg_primary_metric: metricsByVariant[winnerVariantId] ?? 0,
        lift_vs_baseline: liftVsBaseline,
        sample_size: (byVariant[winnerVariantId] ?? []).length,
      });
    }
  }

  return {
    winner_variant_id: winnerVariantId,
    winner_variant_key: winnerVariantKey,
    reason,
    metrics_by_variant: metricsByVariant,
    lift_vs_baseline: liftVsBaseline,
    sufficient_samples: sufficientSamples,
    learnings_created: learningIds,
  };
}

// ============================================================================
// LEARNINGS
// ============================================================================

interface CreateLearningInput {
  project_id: string;
  learning_type: Learning["learning_type"];
  title: string;
  description: string;
  applies_to: Learning["applies_to"];
  evidence_refs: Learning["evidence_refs"];
  strength?: number;
}

export async function createLearning(
  admin: AdminClient,
  input: CreateLearningInput,
): Promise<string> {
  const { data, error } = await admin
    .from("core_learnings")
    .insert({
      project_id: input.project_id,
      learning_type: input.learning_type,
      title: input.title,
      description: input.description,
      applies_to: input.applies_to,
      evidence_refs: input.evidence_refs,
      strength: input.strength ?? 50,
      last_validated_at: new Date().toISOString(),
      active: true,
    })
    .select("learning_id")
    .single();

  if (error || !data)
    throw new Error(`Failed to create learning: ${error?.message}`);
  return data.learning_id as string;
}

/**
 * Get active learnings for a project, optionally filtered by platform/format.
 */
export async function getActiveLearnings(
  admin: AdminClient,
  projectId: string,
  filters?: { platform?: string; format?: string; phase?: string },
): Promise<Learning[]> {
  const { data } = await admin
    .from("core_learnings")
    .select("*")
    .eq("project_id", projectId)
    .eq("active", true)
    .order("strength", { ascending: false });

  let learnings = (data ?? []) as Learning[];

  // In-memory filter by applies_to fields
  if (filters) {
    learnings = learnings.filter((l) => {
      const at = l.applies_to;
      if (
        filters.platform &&
        at.platform?.length &&
        !at.platform.includes(filters.platform)
      )
        return false;
      if (
        filters.format &&
        at.format?.length &&
        !at.format.includes(filters.format)
      )
        return false;
      if (
        filters.phase &&
        at.phase?.length &&
        !at.phase.includes(filters.phase)
      )
        return false;
      return true;
    });
  }

  return learnings;
}

// ============================================================================
// PERFORMANCE WINNERS
// ============================================================================

interface UpsertWinnerInput {
  project_id: string;
  platform: string;
  winner_category: PerformanceWinner["winner_category"];
  winner_key: string;
  summary: string;
  avg_primary_metric: number;
  lift_vs_baseline: number | null;
  sample_size: number;
}

async function upsertPerformanceWinner(
  admin: AdminClient,
  input: UpsertWinnerInput,
): Promise<void> {
  await admin.from("core_performance_winners").upsert(
    {
      project_id: input.project_id,
      platform: input.platform,
      winner_category: input.winner_category,
      winner_key: input.winner_key,
      summary: input.summary,
      avg_primary_metric: input.avg_primary_metric,
      lift_vs_baseline: input.lift_vs_baseline,
      sample_size: input.sample_size,
      last_updated: new Date().toISOString(),
      active: true,
    },
    { onConflict: "project_id,winner_key" },
  );
}

/**
 * Get active performance winners for a project.
 */
export async function getPerformanceWinners(
  admin: AdminClient,
  projectId: string,
  platform?: string,
  category?: string,
): Promise<PerformanceWinner[]> {
  let query = admin
    .from("core_performance_winners")
    .select("*")
    .eq("project_id", projectId)
    .eq("active", true)
    .order("avg_primary_metric", { ascending: false });

  if (platform) query = query.eq("platform", platform);
  if (category) query = query.eq("winner_category", category);

  const { data } = await query;
  return (data ?? []) as PerformanceWinner[];
}

// ============================================================================
// ANALYTICS EVENTS
// ============================================================================

/**
 * Track an analytics event (fire-and-forget, never throws).
 */
export async function trackEvent(
  admin: AdminClient,
  eventType: AnalyticsEventType,
  properties: Record<string, unknown>,
  opts?: {
    project_id?: string;
    user_id?: string;
    session_id?: string;
    has_pii?: boolean;
  },
): Promise<void> {
  try {
    await admin.from("analytics_events").insert({
      event_type: eventType,
      properties,
      project_id: opts?.project_id ?? null,
      user_id: opts?.user_id ?? null,
      session_id: opts?.session_id ?? null,
      has_pii: opts?.has_pii ?? false,
    });
  } catch {
    // Analytics events are non-critical — swallow errors
  }
}

/**
 * Get analytics events for a project.
 */
export async function getAnalyticsEvents(
  admin: AdminClient,
  projectId: string,
  eventType?: AnalyticsEventType,
  since?: string,
  limit = 100,
) {
  let query = admin
    .from("analytics_events")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (eventType) query = query.eq("event_type", eventType);
  if (since) query = query.gte("created_at", since);

  const { data } = await query;
  return data ?? [];
}

// ============================================================================
// COST METRICS
// ============================================================================

/**
 * Record cost metrics for a period (idempotent upsert by project+period+period_start).
 */
export async function recordCostMetrics(
  admin: AdminClient,
  projectId: string,
  period: "daily" | "weekly" | "monthly",
  periodStart: string,
  metrics: {
    credits_spent_total: number;
    credits_spent_by_lab?: Record<string, number>;
    outputs_count?: number;
    published_count?: number;
    follower_delta?: number | null;
    click_delta?: number | null;
    revenue_delta?: number | null;
  },
): Promise<void> {
  const creditsTotal = metrics.credits_spent_total;
  const published = metrics.published_count ?? 0;
  const followers = metrics.follower_delta ?? null;
  const clicks = metrics.click_delta ?? null;
  const revenue = metrics.revenue_delta ?? null;

  const roi: Record<string, number> = {};
  if (published > 0) roi.cost_per_published = creditsTotal / published;
  if (followers && followers > 0)
    roi.cost_per_follower = creditsTotal / followers;
  if (clicks && clicks > 0) roi.cost_per_click = creditsTotal / clicks;
  if (revenue && revenue > 0) roi.roi_simple = revenue / creditsTotal;

  await admin.from("core_cost_metrics").upsert(
    {
      project_id: projectId,
      period,
      period_start: periodStart,
      credits_spent_total: creditsTotal,
      credits_spent_by_lab: metrics.credits_spent_by_lab ?? {},
      outputs_count: metrics.outputs_count ?? 0,
      published_count: published,
      follower_delta: followers,
      click_delta: clicks,
      revenue_delta: revenue,
      computed_roi_json: roi,
    },
    { onConflict: "project_id,period,period_start" },
  );
}

/**
 * Get cost metrics for a project.
 */
export async function getCostMetrics(
  admin: AdminClient,
  projectId: string,
  period?: "daily" | "weekly" | "monthly",
  limit = 12,
) {
  let query = admin
    .from("core_cost_metrics")
    .select("*")
    .eq("project_id", projectId)
    .order("period_start", { ascending: false })
    .limit(limit);

  if (period) query = query.eq("period", period);

  const { data } = await query;
  return data ?? [];
}

// ============================================================================
// HELPERS
// ============================================================================

function extractMetricValue(
  metrics: PostMetrics | null,
  metric: string,
): number | null {
  if (!metrics) return null;
  const val = (metrics as unknown as Record<string, unknown>)[metric];
  return typeof val === "number" ? val : null;
}

function extractBaselineValue(
  baseline: Record<string, unknown>,
  metric: string,
): number | null {
  const map: Record<string, string> = {
    engagement_rate: "engagement_avg_30d",
    views: "views_avg_30d",
    saves_rate: "saves_avg_30d",
    follow_delta: "follows_avg_30d",
  };
  const key = map[metric] ?? metric;
  const val = baseline[key];
  return typeof val === "number" ? val : null;
}

function mapTypeToCategory(
  expType: string,
): PerformanceWinner["winner_category"] {
  const map: Record<string, PerformanceWinner["winner_category"]> = {
    ab_hook: "hook",
    format: "format",
    caption: "hook",
    cta: "cta",
    timing: "timing",
    topic: "topic",
    offer: "offer",
    pricing: "offer",
    visual_style: "format",
  };
  return map[expType] ?? "format";
}

// Re-export types
export * from "./types";
