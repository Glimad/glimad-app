-- Glimad — Master Database Schema (DDL Consolidated v0)
-- Source: Notion page 26_Master Database Schema (DDL Consolidado v0)
-- Execution order follows dependency graph below.
--
-- Dependency Order:
-- 1. auth.users (Supabase built-in)
-- 2. onboarding_sessions, experiments, experiment_variants
-- 3. projects, user_preferences
-- 4. core_plans, core_credit_products, core_stripe_products
-- 5. core_wallets, core_ledger_reasons, core_ledger, core_credit_rules
-- 6. core_subscriptions, core_payments, stripe_events
-- 7. brain_facts, brain_signals, brain_snapshots
-- 8. core_scrape_sources, core_scrape_runs, core_jobs
-- 9. mission_templates, mission_instances, mission_steps
-- 10. core_outputs, core_assets, core_calendar_items
-- 11. core_phase_runs, core_inflexion_events, core_rules_phase_weights,
--     core_rules_gates, core_policy_rules, core_policy_runs,
--     core_priority_weights, core_mission_cooldowns
-- 12. core_labs_config
-- 13. core_security_events, event_log
-- 14. seo_metrics, seo_optimization_logs

-- ============================================================
-- 1. ONBOARDING & FUNNEL
-- ============================================================

CREATE TABLE experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  hypothesis TEXT,
  status TEXT CHECK (status IN ('draft', 'running', 'paused', 'completed')) NOT NULL DEFAULT 'draft',
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_experiments_status ON experiments(status);

CREATE TABLE experiment_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 50,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(experiment_id, name)
);

CREATE INDEX idx_experiment_variants_experiment_id ON experiment_variants(experiment_id);

CREATE TABLE onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES experiment_variants(id),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  responses JSONB NOT NULL DEFAULT '{}',
  step_current TEXT,
  step_completed TEXT[],
  status TEXT CHECK (status IN ('started', 'completed', 'abandoned')) NOT NULL DEFAULT 'started',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_onboarding_sessions_user_id ON onboarding_sessions(user_id);
CREATE INDEX idx_onboarding_sessions_status ON onboarding_sessions(status);
CREATE INDEX idx_onboarding_sessions_created_at ON onboarding_sessions(created_at DESC);

-- ============================================================
-- 2. PROJECTS & USERS
-- ============================================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT CHECK (status IN ('created', 'scraping', 'scored', 'active', 'archived')) NOT NULL DEFAULT 'created',
  phase_code TEXT CHECK (phase_code IN ('F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7')),
  active_mode TEXT CHECK (active_mode IN ('test', 'scale', 'monetize')),
  publishing_mode TEXT CHECK (publishing_mode IN ('BUILDING', 'LIVE')) NOT NULL DEFAULT 'BUILDING',
  calendar_coverage_days_focus INTEGER DEFAULT 0,
  onboarding_session_id UUID REFERENCES onboarding_sessions(id),
  objectives TEXT[],
  blockers TEXT[],
  focus_platform TEXT,
  focus_platform_handle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX unique_active_project_per_user ON projects(user_id) WHERE (status != 'archived');
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_phase_code ON projects(phase_code);
CREATE INDEX idx_projects_publishing_mode ON projects(publishing_mode);

CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  face_visibility TEXT CHECK (face_visibility IN ('yes', 'no', 'maybe')) DEFAULT 'maybe',
  tone TEXT,
  languages TEXT[] DEFAULT ARRAY['es-ES'],
  availability_hours_week INTEGER,
  risk_constraints TEXT[],
  comfort_level_sales INTEGER CHECK (comfort_level_sales >= 1 AND comfort_level_sales <= 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id)
);

CREATE INDEX idx_user_preferences_project_id ON user_preferences(project_id);

-- ============================================================
-- 3. PLANS & PRODUCTS
-- ============================================================

CREATE TABLE core_plans (
  plan_code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_monthly_eur NUMERIC(10,2) NOT NULL,
  allowance_llm_monthly INTEGER NOT NULL,
  premium_credits_monthly INTEGER NOT NULL,
  max_projects INTEGER NOT NULL DEFAULT 1,
  features_json JSONB,
  overage_rules_json JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE core_credit_products (
  sku TEXT PRIMARY KEY,
  type TEXT CHECK (type IN ('premium_credits', 'allowance_llm')) NOT NULL,
  amount INTEGER NOT NULL,
  price_eur NUMERIC(10,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE core_stripe_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_product_id TEXT UNIQUE NOT NULL,
  stripe_price_id TEXT UNIQUE NOT NULL,
  plan_code TEXT REFERENCES core_plans(plan_code),
  sku TEXT REFERENCES core_credit_products(sku),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stripe_products_plan_code ON core_stripe_products(plan_code);
CREATE INDEX idx_stripe_products_sku ON core_stripe_products(sku);

-- ============================================================
-- 4. WALLET & ECONOMY
-- ============================================================

CREATE TABLE core_wallets (
  wallet_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES core_plans(plan_code),
  allowance_llm_balance INTEGER NOT NULL DEFAULT 0,
  credits_allowance INTEGER NOT NULL DEFAULT 0,
  premium_credits_balance INTEGER NOT NULL DEFAULT 0,
  premium_daily_cap_remaining INTEGER NOT NULL DEFAULT 0,
  allowance_reset_at TIMESTAMPTZ NOT NULL,
  premium_reset_at TIMESTAMPTZ NOT NULL,
  status TEXT CHECK (status IN ('active', 'past_due', 'locked')) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallets_project_id ON core_wallets(project_id);
CREATE INDEX idx_wallets_status ON core_wallets(status);

CREATE TABLE core_ledger_reasons (
  reason_key TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  type TEXT CHECK (type IN ('premium', 'allowance', 'both')) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE core_ledger (
  ledger_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind TEXT CHECK (kind IN ('hold', 'debit', 'credit', 'release', 'adjustment')) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  amount_eur NUMERIC(10,2),
  amount_allowance INTEGER,
  amount_premium INTEGER,
  reason_key TEXT NOT NULL REFERENCES core_ledger_reasons(reason_key),
  ref_type TEXT,
  ref_id TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  metadata_json JSONB
);

CREATE INDEX idx_ledger_project_id ON core_ledger(project_id);
CREATE INDEX idx_ledger_created_at ON core_ledger(created_at DESC);
CREATE INDEX idx_ledger_idempotency_key ON core_ledger(idempotency_key);
CREATE INDEX idx_ledger_reason_key ON core_ledger(reason_key);

CREATE TABLE core_credit_rules (
  action_key TEXT PRIMARY KEY,
  consumes_allowance BOOLEAN NOT NULL DEFAULT false,
  cost_allowance INTEGER,
  consumes_premium BOOLEAN NOT NULL DEFAULT false,
  cost_premium INTEGER,
  daily_cap INTEGER,
  cooldown_seconds INTEGER,
  requires_plan_min TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. PAYMENTS & STRIPE
-- ============================================================

CREATE TABLE core_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  plan_code TEXT NOT NULL REFERENCES core_plans(plan_code),
  status TEXT CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete')) NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_project_id ON core_subscriptions(project_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON core_subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON core_subscriptions(status);

CREATE TABLE core_payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  project_id UUID REFERENCES projects(id),
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT,
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  amount_eur NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT CHECK (status IN ('succeeded', 'failed', 'pending')) NOT NULL,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_user_id ON core_payments(user_id);
CREATE INDEX idx_payments_project_id ON core_payments(project_id);
CREATE INDEX idx_payments_stripe_event_id ON core_payments(stripe_event_id);
CREATE INDEX idx_payments_created_at ON core_payments(created_at DESC);

CREATE TABLE stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  data JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stripe_events_stripe_event_id ON stripe_events(stripe_event_id);
CREATE INDEX idx_stripe_events_processed ON stripe_events(processed);
CREATE INDEX idx_stripe_events_event_type ON stripe_events(event_type);

-- ============================================================
-- 6. BRAIN SYSTEM
-- ============================================================

CREATE TABLE brain_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fact_key TEXT NOT NULL,
  value JSONB NOT NULL,
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, fact_key)
);

CREATE INDEX idx_brain_facts_project_id ON brain_facts(project_id);
CREATE INDEX idx_brain_facts_fact_key ON brain_facts(fact_key);
CREATE INDEX idx_brain_facts_updated_at ON brain_facts(updated_at DESC);

CREATE TABLE brain_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  signal_key TEXT NOT NULL,
  value JSONB NOT NULL,
  timeframe TEXT,
  source TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX idx_brain_signals_project_id ON brain_signals(project_id);
CREATE INDEX idx_brain_signals_signal_key ON brain_signals(signal_key);
CREATE INDEX idx_brain_signals_observed_at ON brain_signals(observed_at DESC);
CREATE INDEX idx_brain_signals_project_signal ON brain_signals(project_id, signal_key, observed_at DESC);

CREATE TABLE brain_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL,
  phase_code TEXT,
  facts_snapshot JSONB NOT NULL,
  signals_summary JSONB,
  trigger_source TEXT,
  snapshot_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_brain_snapshots_project_id ON brain_snapshots(project_id);
CREATE INDEX idx_brain_snapshots_snapshot_type ON brain_snapshots(snapshot_type);
CREATE INDEX idx_brain_snapshots_created_at ON brain_snapshots(created_at DESC);
CREATE INDEX idx_brain_snapshots_snapshot_hash ON brain_snapshots(snapshot_hash);

-- ============================================================
-- PROJECT PLATFORMS (satellite / observe platforms per project)
-- ============================================================

CREATE TABLE projects_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  handle TEXT,
  role TEXT CHECK (role IN ('focus', 'satellite', 'observe')) NOT NULL DEFAULT 'satellite',
  connected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, platform)
);

CREATE INDEX idx_projects_platforms_project_id ON projects_platforms(project_id);

-- ============================================================
-- GAMIFICATION (XP, energy, streaks — stored on projects)
-- ============================================================

ALTER TABLE projects ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN energy INTEGER NOT NULL DEFAULT 100;
ALTER TABLE projects ADD COLUMN streak_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN last_active_date DATE;
ALTER TABLE projects ADD COLUMN badges_json JSONB NOT NULL DEFAULT '[]';

-- ============================================================
-- 7. SCRAPING
-- ============================================================

CREATE TABLE core_scrape_sources (
  platform TEXT PRIMARY KEY,
  method TEXT CHECK (method IN ('official_api', 'scraper', 'manual_import')) NOT NULL,
  supports_posts BOOLEAN NOT NULL DEFAULT false,
  supports_metrics BOOLEAN NOT NULL DEFAULT false,
  supports_followers BOOLEAN NOT NULL DEFAULT false,
  default_frequency_hours INTEGER NOT NULL DEFAULT 24,
  limits_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE core_scrape_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_json JSONB,
  normalized_json JSONB,
  idempotency_key TEXT UNIQUE NOT NULL,
  notes TEXT
);

CREATE INDEX idx_scrape_runs_project_id ON core_scrape_runs(project_id);
CREATE INDEX idx_scrape_runs_platform ON core_scrape_runs(platform);
CREATE INDEX idx_scrape_runs_fetched_at ON core_scrape_runs(fetched_at DESC);
CREATE INDEX idx_scrape_runs_idempotency_key ON core_scrape_runs(idempotency_key);

CREATE TABLE core_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  job_type TEXT NOT NULL,
  status TEXT CHECK (status IN ('queued', 'running', 'done', 'failed', 'canceled')) NOT NULL DEFAULT 'queued',
  priority TEXT CHECK (priority IN ('low', 'normal', 'high')) NOT NULL DEFAULT 'normal',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  idempotency_key TEXT UNIQUE NOT NULL,
  cost_premium_credits INTEGER,
  cost_allowance_llm INTEGER,
  error_text TEXT,
  payload_json JSONB
);

CREATE INDEX idx_jobs_project_id ON core_jobs(project_id);
CREATE INDEX idx_jobs_status ON core_jobs(status);
CREATE INDEX idx_jobs_requested_at ON core_jobs(requested_at DESC);
CREATE INDEX idx_jobs_idempotency_key ON core_jobs(idempotency_key);

-- ============================================================
-- PLATFORM METRICS (structured social metrics from scrapes)
-- ============================================================

CREATE TABLE platform_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  followers_count INTEGER,
  following_count INTEGER,
  posts_count INTEGER,
  avg_engagement_rate NUMERIC(5,4),
  avg_views INTEGER,
  avg_likes INTEGER,
  avg_comments INTEGER,
  recent_posts_7d INTEGER,
  monthly_listeners INTEGER,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_metrics_project_id ON platform_metrics(project_id);
CREATE INDEX idx_platform_metrics_platform ON platform_metrics(platform);
CREATE INDEX idx_platform_metrics_fetched_at ON platform_metrics(fetched_at DESC);

-- ============================================================
-- 8. MISSION SYSTEM
-- ============================================================

CREATE TABLE mission_templates (
  template_code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK (type IN ('discovery', 'planning', 'execution', 'analysis', 'rescue')) NOT NULL,
  phase_min TEXT,
  phase_max TEXT,
  credit_cost_premium INTEGER NOT NULL DEFAULT 0,
  credit_cost_allowance INTEGER NOT NULL DEFAULT 0,
  estimated_minutes INTEGER,
  cooldown_hours INTEGER NOT NULL DEFAULT 0,
  steps_json JSONB NOT NULL,
  params_schema JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mission_templates_type ON mission_templates(type);
CREATE INDEX idx_mission_templates_active ON mission_templates(active);

CREATE TABLE mission_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_code TEXT NOT NULL REFERENCES mission_templates(template_code),
  status TEXT CHECK (status IN ('queued', 'running', 'waiting_input', 'completed', 'failed', 'canceled')) NOT NULL DEFAULT 'queued',
  priority_score INTEGER CHECK (priority_score >= 0 AND priority_score <= 100),
  params JSONB,
  credit_budget JSONB,
  unique_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  current_step INTEGER DEFAULT 0,
  outputs JSONB,
  error_text TEXT
);

CREATE INDEX idx_mission_instances_project_id ON mission_instances(project_id);
CREATE INDEX idx_mission_instances_template_code ON mission_instances(template_code);
CREATE INDEX idx_mission_instances_status ON mission_instances(status);
CREATE INDEX idx_mission_instances_unique_key ON mission_instances(unique_key);
CREATE INDEX idx_mission_instances_created_at ON mission_instances(created_at DESC);

CREATE TABLE mission_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_instance_id UUID NOT NULL REFERENCES mission_instances(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')) NOT NULL DEFAULT 'pending',
  input JSONB,
  output JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_text TEXT,
  UNIQUE(mission_instance_id, step_number)
);

CREATE INDEX idx_mission_steps_mission_instance_id ON mission_steps(mission_instance_id);
CREATE INDEX idx_mission_steps_status ON mission_steps(status);

-- ============================================================
-- DAILY PULSE LOG
-- ============================================================

CREATE TABLE pulse_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  triggered_by TEXT CHECK (triggered_by IN ('schedule', 'event', 'manual')) NOT NULL,
  signals_collected INTEGER NOT NULL DEFAULT 0,
  events_detected INTEGER NOT NULL DEFAULT 0,
  missions_assigned INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_pulse_runs_project_id ON pulse_runs(project_id, started_at DESC);

-- ============================================================
-- 9. CONTENT & CALENDAR
-- ============================================================

CREATE TABLE core_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mission_instance_id UUID REFERENCES mission_instances(id),
  output_type TEXT NOT NULL,
  format TEXT,
  platform TEXT,
  content JSONB NOT NULL,
  status TEXT CHECK (status IN ('draft', 'ready', 'approved', 'published', 'archived')) NOT NULL DEFAULT 'draft',
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outputs_project_id ON core_outputs(project_id);
CREATE INDEX idx_outputs_mission_instance_id ON core_outputs(mission_instance_id);
CREATE INDEX idx_outputs_status ON core_outputs(status);
CREATE INDEX idx_outputs_platform ON core_outputs(platform);

CREATE TABLE core_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  output_id UUID REFERENCES core_outputs(id),
  asset_type TEXT CHECK (asset_type IN ('image', 'video', 'audio', 'document')) NOT NULL,
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assets_project_id ON core_assets(project_id);
CREATE INDEX idx_assets_output_id ON core_assets(output_id);
CREATE INDEX idx_assets_asset_type ON core_assets(asset_type);

CREATE TABLE core_calendar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  output_id UUID REFERENCES core_outputs(id),
  platform TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT CHECK (status IN ('draft', 'ready', 'scheduled', 'published', 'failed', 'canceled')) NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  external_post_id TEXT,
  idempotency_key TEXT UNIQUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calendar_items_project_id ON core_calendar_items(project_id);
CREATE INDEX idx_calendar_items_platform ON core_calendar_items(platform);
CREATE INDEX idx_calendar_items_scheduled_at ON core_calendar_items(scheduled_at);
CREATE INDEX idx_calendar_items_status ON core_calendar_items(status);

-- ============================================================
-- CONTENT BATCHES (groups of calendar items created together)
-- ============================================================

CREATE TABLE content_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mission_instance_id UUID REFERENCES mission_instances(id),
  platform TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  status TEXT CHECK (status IN ('draft', 'approved', 'scheduled', 'completed')) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_batches_project_id ON content_batches(project_id);

ALTER TABLE core_calendar_items ADD COLUMN batch_id UUID REFERENCES content_batches(id);

-- ============================================================
-- 10. ENGINES & RULES
-- ============================================================

CREATE TABLE core_phase_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_code TEXT CHECK (phase_code IN ('F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7')) NOT NULL,
  capability_score INTEGER CHECK (capability_score >= 0 AND capability_score <= 100) NOT NULL,
  dimension_scores JSONB NOT NULL,
  gates_json JSONB NOT NULL,
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1) NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason_summary TEXT NOT NULL
);

CREATE INDEX idx_phase_runs_project_computed ON core_phase_runs(project_id, computed_at DESC);
CREATE INDEX idx_phase_runs_phase_code ON core_phase_runs(phase_code, computed_at DESC);

CREATE TABLE core_inflexion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  type TEXT CHECK (type IN ('alert', 'upgrade', 'downgrade', 'mode_change')) NOT NULL,
  severity TEXT CHECK (severity IN ('low', 'med', 'high')) NOT NULL,
  recommended_mode TEXT CHECK (recommended_mode IN ('test', 'scale', 'monetize')),
  recommended_actions JSONB NOT NULL,
  evidence_bundle JSONB NOT NULL,
  cooldown_hours INTEGER NOT NULL DEFAULT 168,
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inflexion_events_project_created ON core_inflexion_events(project_id, created_at DESC);
CREATE INDEX idx_inflexion_events_event_key ON core_inflexion_events(event_key, created_at DESC);
CREATE INDEX idx_inflexion_events_project_event ON core_inflexion_events(project_id, event_key, created_at DESC);

CREATE TABLE core_rules_phase_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL UNIQUE,
  weights_json JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_rules_phase_weights_active ON core_rules_phase_weights(active) WHERE active = true;

CREATE TABLE core_rules_gates (
  gate_key TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  condition_json JSONB NOT NULL,
  applies_to_phase TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rules_gates_active ON core_rules_gates(active);

CREATE TABLE core_policy_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rule_type TEXT CHECK (rule_type IN ('unlock_labs', 'mode_select', 'mission_jit', 'priority_adjust', 'purchase_prompt')) NOT NULL,
  condition_json JSONB NOT NULL,
  action_json JSONB NOT NULL,
  priority_weight INTEGER NOT NULL DEFAULT 100,
  cooldown_hours INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policy_rules_rule_type ON core_policy_rules(rule_type, active);
CREATE INDEX idx_policy_rules_version ON core_policy_rules(version, active);

CREATE TABLE core_policy_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  input_ref JSONB NOT NULL,
  output_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policy_runs_project_created ON core_policy_runs(project_id, created_at DESC);

CREATE TABLE core_priority_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL UNIQUE,
  weights_json JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_priority_weights_active ON core_priority_weights(active) WHERE active = true;

CREATE TABLE core_mission_cooldowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_code TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cooldown_until TIMESTAMPTZ NOT NULL,
  UNIQUE(project_id, template_code, triggered_at)
);

CREATE INDEX idx_mission_cooldowns_project_template ON core_mission_cooldowns(project_id, template_code, cooldown_until DESC);

-- ============================================================
-- 11. LABS & CONFIG
-- ============================================================

CREATE TABLE core_labs_config (
  lab_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  prerequisite_phase TEXT,
  prerequisite_condition JSONB,
  features_json JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 12. SECURITY & EVENTS
-- ============================================================

CREATE TABLE core_security_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT CHECK (type IN ('bot_suspected', 'scrape_abuse', 'payment_abuse', 'signup_spam')) NOT NULL,
  evidence_json JSONB,
  action_taken TEXT CHECK (action_taken IN ('throttle', 'lock', 'require_verify', 'none'))
);

CREATE INDEX idx_security_events_project_id ON core_security_events(project_id);
CREATE INDEX idx_security_events_user_id ON core_security_events(user_id);
CREATE INDEX idx_security_events_type ON core_security_events(type);
CREATE INDEX idx_security_events_created_at ON core_security_events(created_at DESC);

CREATE TABLE event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  event_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_log_project_id ON event_log(project_id, created_at DESC);
CREATE INDEX idx_event_log_user_id ON event_log(user_id, created_at DESC);
CREATE INDEX idx_event_log_event_type ON event_log(event_type, created_at DESC);

-- ============================================================
-- 13. SEO & MONITORING
-- ============================================================

CREATE TABLE seo_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'lcp', 'fid', 'cls', 'ttfb', 'inp',
    'organic_visits', 'bounce_rate', 'avg_time_on_page',
    'keyword_position', 'backlinks', 'indexed_pages'
  )),
  value NUMERIC NOT NULL,
  metadata JSONB DEFAULT '{}',
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_seo_metrics_url ON seo_metrics(url, metric_type, measured_at DESC);
CREATE INDEX idx_seo_metrics_type ON seo_metrics(metric_type, measured_at DESC);

CREATE TABLE seo_optimization_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  output_id UUID REFERENCES core_outputs(id),
  platform TEXT NOT NULL,
  optimization_type TEXT NOT NULL CHECK (optimization_type IN (
    'youtube_seo', 'hashtag_optimization', 'blog_seo',
    'pinterest_seo', 'seo_autofix', 'llm_seo'
  )),
  seo_score_before INTEGER CHECK (seo_score_before >= 0 AND seo_score_before <= 100),
  seo_score_after INTEGER CHECK (seo_score_after >= 0 AND seo_score_after <= 100),
  optimizations_applied JSONB NOT NULL DEFAULT '[]',
  keywords_used TEXT[],
  llm_optimizations JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_seo_opt_logs_project ON seo_optimization_logs(project_id, created_at DESC);
CREATE INDEX idx_seo_opt_logs_output ON seo_optimization_logs(output_id);
CREATE INDEX idx_seo_opt_logs_type ON seo_optimization_logs(optimization_type);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_calendar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_optimization_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects" ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own projects" ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON projects FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own brain facts" ON brain_facts FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = brain_facts.project_id AND projects.user_id = auth.uid()));

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO core_plans (plan_code, name, price_monthly_eur, allowance_llm_monthly, premium_credits_monthly, max_projects, active)
VALUES
  ('BASE', 'Base', 29.00, 2000, 500, 1, true),
  ('PRO', 'Pro', 59.00, 5000, 1250, 1, true),
  ('ELITE', 'Elite', 129.00, 12500, 3125, 1, true);

INSERT INTO core_credit_products (sku, type, amount, price_eur, active)
VALUES
  ('TOPUP_PREMIUM_300', 'premium_credits', 300, 9.00, true),
  ('TOPUP_PREMIUM_1000', 'premium_credits', 1000, 25.00, true),
  ('TOPUP_LLM_1000', 'allowance_llm', 1000, 7.00, true);

INSERT INTO core_ledger_reasons (reason_key, description, type)
VALUES
  ('PLAN_MONTHLY_GRANT', 'Monthly plan credit grant', 'both'),
  ('TOPUP_GRANT', 'Top-up purchase', 'premium'),
  ('MISSION_ALLOWANCE_DEBIT', 'Mission using allowance LLM', 'allowance'),
  ('MISSION_PREMIUM_DEBIT', 'Mission using premium credits', 'premium'),
  ('SCRAPE_LIGHT_DEBIT', 'Scrape Light execution', 'premium'),
  ('IMAGE_GEN_DEBIT', 'Image generation', 'premium'),
  ('VIDEO_GEN_DEBIT', 'Video generation', 'premium'),
  ('BATCH_DEBIT', 'Batch content generation', 'premium'),
  ('ADMIN_ADJUSTMENT', 'Manual admin adjustment', 'both'),
  ('REFUND_CREDIT', 'Refund credit', 'both');

INSERT INTO core_credit_rules (action_key, consumes_allowance, cost_allowance, consumes_premium, cost_premium, daily_cap, cooldown_seconds, requires_plan_min)
VALUES
  ('ask_glimy_text', true, 1, false, 0, NULL, 0, 'BASE'),
  ('scrape_light_focus', false, 0, true, 5, 1, 86400, 'BASE'),
  ('batch_3d_assets', false, 0, true, 50, 1, 259200, 'BASE'),
  ('batch_7d_assets', false, 0, true, 200, 1, 604800, 'PRO'),
  ('batch_14d_assets', false, 0, true, 400, 1, 1209600, 'ELITE'),
  ('gen_image', false, 0, true, 10, 10, 0, 'BASE'),
  ('gen_video', false, 0, true, 40, 5, 0, 'ELITE');

INSERT INTO core_scrape_sources (platform, method, supports_posts, supports_metrics, supports_followers, default_frequency_hours)
VALUES
  ('instagram', 'scraper', true, true, true, 24),
  ('tiktok', 'scraper', true, true, true, 24),
  ('youtube', 'official_api', true, true, true, 24),
  ('spotify', 'official_api', true, true, true, 168),
  ('twitter', 'official_api', true, true, true, 24);

INSERT INTO core_rules_phase_weights (version, weights_json, active)
VALUES (1, '{
  "identity": 15,
  "format": 15,
  "consistency": 15,
  "community": 10,
  "product": 15,
  "multiplatform": 10,
  "operations": 10,
  "brands": 10
}'::jsonb, true);

INSERT INTO core_priority_weights (version, weights_json, active)
VALUES (1, '{
  "impact": 0.4,
  "urgency": 0.2,
  "feasibility": 0.2,
  "learning": 0.1,
  "user_fit": 0.1
}'::jsonb, true);

-- ============================================================
-- TRIGGER: auto-create project on new auth user
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.projects (user_id, name, status, phase_code)
  VALUES (NEW.id, NEW.email, 'created', 'F0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
