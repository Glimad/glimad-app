/**
 * lib/experiments/types.ts
 * Brief 15: Experiments & Analytics Registry — Type Definitions
 */

// ============================================================================
// EXPERIMENT
// ============================================================================

export type ExperimentStatus =
  | "planned"
  | "running"
  | "completed"
  | "invalidated";

export type ExperimentType =
  | "ab_hook"
  | "format"
  | "caption"
  | "visual_style"
  | "timing"
  | "topic"
  | "cta"
  | "offer"
  | "pricing";

export type PlatformScope = "focus" | "satellite" | "multi";

export type PrimaryMetric =
  | "engagement_rate"
  | "views"
  | "follow_delta"
  | "click_rate"
  | "saves_rate"
  | "reply_rate"
  | "conversion_rate";

export interface SuccessCriteria {
  winner_rule: "highest_primary_metric" | "first_above_threshold";
  min_samples: number; // minimum posts per variant
  min_lift_percent?: number; // minimum % lift over baseline to declare winner
  guardrails?: Record<string, number>; // e.g. { min_comments: 10 }
}

export interface BaselineSnapshot {
  views_avg_30d?: number;
  engagement_avg_30d?: number;
  saves_avg_30d?: number;
  follows_avg_30d?: number;
  captured_at?: string;
}

export interface Experiment {
  experiment_id: string;
  project_id: string;
  status: ExperimentStatus;
  hypothesis: string;
  experiment_type: ExperimentType;
  platform_scope: PlatformScope;
  metric_primary: PrimaryMetric;
  metric_secondary: Record<string, unknown> | null;
  timeframe_days: number;
  start_at: string | null;
  end_at: string | null;
  success_criteria: SuccessCriteria;
  baseline_json: BaselineSnapshot | null;
  idempotency_key: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// VARIANT
// ============================================================================

export interface ExperimentVariant {
  variant_id: string;
  experiment_id: string;
  variant_key: string; // "A", "B", "C"
  variant_name: string;
  spec_json: Record<string, unknown>;
  created_at: string;
}

// ============================================================================
// EXPERIMENT ITEM (evidence)
// ============================================================================

export interface PostMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  profile_visits: number;
  follows_from_post: number;
  clicks: number;
  watch_time_sec_avg: number | null;
  // Derived (computed)
  engagement_rate?: number;
  save_rate?: number;
  follow_rate?: number;
  click_rate?: number;
}

export type MetricsSource = "scrape" | "manual" | "mixed";

export interface ExperimentItem {
  experiment_item_id: string;
  experiment_id: string;
  variant_id: string;
  calendar_item_id: string;
  asset_id: string | null;
  published_at: string | null;
  metrics_json: PostMetrics | null;
  source: MetricsSource;
  confidence: number;
  created_at: string;
}

// ============================================================================
// LEARNING
// ============================================================================

export type LearningType =
  | "winner"
  | "loser"
  | "guardrail"
  | "audience_insight"
  | "platform_rule"
  | "offer_insight";

export interface LearningAppliesTo {
  platform?: string[];
  format?: string[];
  topic_tags?: string[];
  phase?: string[];
}

export interface Learning {
  learning_id: string;
  project_id: string;
  learning_type: LearningType;
  title: string;
  description: string;
  applies_to: LearningAppliesTo;
  evidence_refs: { experiment_ids?: string[]; item_ids?: string[] };
  strength: number; // 0–100
  last_validated_at: string | null;
  active: boolean;
  created_at: string;
}

// ============================================================================
// PERFORMANCE WINNER (materialized)
// ============================================================================

export type WinnerCategory =
  | "format"
  | "hook"
  | "cta"
  | "timing"
  | "topic"
  | "offer";

export interface PerformanceWinner {
  winner_id: string;
  project_id: string;
  platform: string;
  winner_category: WinnerCategory;
  winner_key: string;
  summary: string;
  avg_primary_metric: number;
  lift_vs_baseline: number | null;
  sample_size: number;
  last_updated: string;
  active: boolean;
}

// ============================================================================
// COST METRICS
// ============================================================================

export type CostPeriod = "daily" | "weekly" | "monthly";

export interface CostMetrics {
  cost_id: string;
  project_id: string;
  period: CostPeriod;
  period_start: string;
  credits_spent_total: number;
  credits_spent_by_lab: Record<string, number>;
  outputs_count: number;
  published_count: number;
  follower_delta: number | null;
  click_delta: number | null;
  revenue_delta: number | null;
  computed_roi_json: {
    cost_per_published?: number;
    cost_per_follower?: number;
    cost_per_click?: number;
    impact_score?: number;
  };
  created_at: string;
}

// ============================================================================
// ANALYTICS EVENT
// ============================================================================

export type AnalyticsEventType =
  | "page_view"
  | "button_click"
  | "mission_started"
  | "mission_completed"
  | "content_approved"
  | "content_published"
  | "experiment_created"
  | "experiment_completed"
  | "learning_applied"
  | "upgrade_clicked"
  | "feature_used";

export interface AnalyticsEvent {
  event_id: string;
  project_id: string | null;
  user_id: string | null;
  event_type: AnalyticsEventType;
  properties: Record<string, unknown>;
  session_id: string | null;
  has_pii: boolean;
  created_at: string;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface CreateExperimentInput {
  project_id: string;
  hypothesis: string;
  experiment_type: ExperimentType;
  platform_scope?: PlatformScope;
  metric_primary: PrimaryMetric;
  metric_secondary?: Record<string, unknown>;
  timeframe_days: number;
  success_criteria: SuccessCriteria;
  baseline_json?: BaselineSnapshot;
  notes?: string;
  idempotency_key?: string;
  variants: Array<{
    variant_key: string;
    variant_name: string;
    spec_json: Record<string, unknown>;
  }>;
}

export interface AddExperimentItemInput {
  experiment_id: string;
  variant_id: string;
  calendar_item_id: string;
  asset_id?: string;
  published_at?: string;
  metrics?: Partial<PostMetrics>;
  source?: MetricsSource;
  confidence?: number;
}

export interface WinnerSelectionResult {
  winner_variant_id: string | null;
  winner_variant_key: string | null;
  reason: string;
  metrics_by_variant: Record<string, number>;
  lift_vs_baseline: number | null;
  sufficient_samples: boolean;
  learnings_created: string[];
}
