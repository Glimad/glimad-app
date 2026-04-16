-- Migration 003: Billing — missing tables + seed data
-- Source: SSOT docs 04 + 05

-- ============================================================
-- New tables
-- ============================================================

CREATE TABLE IF NOT EXISTS core_stripe_customers (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core_access_grants (
  access_grant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  source TEXT CHECK (source IN ('subscription', 'admin')) NOT NULL,
  status TEXT CHECK (status IN ('active', 'revoked')) NOT NULL DEFAULT 'active',
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  reference_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_grants_user_status ON core_access_grants(user_id, status);

-- Add user_id to core_subscriptions for direct lookup
ALTER TABLE core_subscriptions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON core_subscriptions(user_id);

-- ============================================================
-- Seed: core_plans
-- ============================================================

INSERT INTO core_plans (plan_code, name, price_monthly_eur, allowance_llm_monthly, premium_credits_monthly, max_projects, active)
VALUES
  ('starter', 'Starter', 39.00,  2000,  500,  1, true),
  ('growth',  'Growth',  69.00,  5000,  1250, 1, true),
  ('scale',   'Scale',   149.00, 12500, 3125, 1, true)
ON CONFLICT (plan_code) DO UPDATE SET
  price_monthly_eur     = EXCLUDED.price_monthly_eur,
  allowance_llm_monthly = EXCLUDED.allowance_llm_monthly,
  premium_credits_monthly = EXCLUDED.premium_credits_monthly,
  active = EXCLUDED.active;

-- ============================================================
-- Seed: core_ledger_reasons
-- ============================================================

INSERT INTO core_ledger_reasons (reason_key, description, type) VALUES
  ('PLAN_MONTHLY_GRANT',         'Monthly plan grant (allowance + premium)',  'both'),
  ('TOPUP_GRANT',                'Top-up purchase',                           'premium'),
  ('MISSION_ALLOWANCE_DEBIT',    'Mission LLM step (allowance)',               'allowance'),
  ('MISSION_PREMIUM_HOLD',       'Mission premium credit hold',               'premium'),
  ('MISSION_PREMIUM_DEBIT',      'Mission premium credit debit',              'premium'),
  ('SCRAPE_LIGHT_DEBIT',         'Scrape Light execution',                    'premium'),
  ('DAILY_PULSE_ALLOWANCE_DEBIT','Daily Pulse LLM call',                      'allowance'),
  ('ADMIN_ADJUSTMENT',           'Manual admin adjustment',                   'both'),
  ('REFUND_CREDIT',              'Refund credit restore',                     'both')
ON CONFLICT (reason_key) DO NOTHING;

-- ============================================================
-- Seed: core_credit_rules
-- ============================================================

INSERT INTO core_credit_rules (action_key, consumes_allowance, cost_allowance, consumes_premium, cost_premium, daily_cap, cooldown_seconds, requires_plan_min) VALUES
  ('ask_glimy_text',         true,  1,   false, 0,   NULL, NULL,  'BASE'),
  ('scrape_light_focus',     false, 0,   true,  5,   3,    7200,  'BASE'),
  ('content_batch_7d',       false, 0,   true,  200, 2,    NULL,  'PRO'),
  ('daily_pulse',            true,  10,  false, 0,   1,    86400, 'BASE'),
  ('mission_run',            true,  5,   false, 0,   10,   NULL,  'BASE'),
  ('image_gen',              false, 0,   true,  150, 5,    1800,  'PRO'),
  ('video_gen',              false, 0,   true,  300, 2,    3600,  'ELITE'),
  ('brand_backstage_update', false, 0,   true,  30,  3,    7200,  'BASE')
ON CONFLICT (action_key) DO NOTHING;
