-- Migration 002: Align onboarding_sessions with SSOT doc 01
-- Add visitor_sessions and experiment_events tables

-- ============================================================
-- Alter onboarding_sessions to match SSOT
-- ============================================================

ALTER TABLE onboarding_sessions
  ADD COLUMN IF NOT EXISTS visitor_id UUID,
  ADD COLUMN IF NOT EXISTS converted_to_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS experiment_variant TEXT DEFAULT 'control',
  ADD COLUMN IF NOT EXISTS responses_json JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS step_total INTEGER DEFAULT 6,
  ADD COLUMN IF NOT EXISTS time_to_complete_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ;

-- Drop old columns
ALTER TABLE onboarding_sessions
  DROP COLUMN IF EXISTS responses,
  DROP COLUMN IF EXISTS step_completed,
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS variant_id,
  DROP COLUMN IF EXISTS utm_source,
  DROP COLUMN IF EXISTS utm_medium,
  DROP COLUMN IF EXISTS utm_campaign;

-- Replace step_current TEXT with INTEGER
ALTER TABLE onboarding_sessions DROP COLUMN IF EXISTS step_current;
ALTER TABLE onboarding_sessions ADD COLUMN step_current INTEGER DEFAULT 1;

-- Replace status constraint
ALTER TABLE onboarding_sessions DROP CONSTRAINT IF EXISTS onboarding_sessions_status_check;
ALTER TABLE onboarding_sessions ADD CONSTRAINT onboarding_sessions_status_check
  CHECK (status IN ('in_progress', 'completed', 'abandoned'));
UPDATE onboarding_sessions SET status = 'in_progress' WHERE status = 'started';

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_visitor_id ON onboarding_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_experiment_variant ON onboarding_sessions(experiment_variant);

-- ============================================================
-- visitor_sessions
-- ============================================================

CREATE TABLE IF NOT EXISTS visitor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  landing_page TEXT,
  referrer TEXT,
  device_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_to_user_id UUID REFERENCES auth.users(id),
  converted_at TIMESTAMPTZ,
  UNIQUE(visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_visitor_sessions_visitor_id ON visitor_sessions(visitor_id);

-- ============================================================
-- experiment_events
-- ============================================================

CREATE TABLE IF NOT EXISTS experiment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_key TEXT NOT NULL,
  variant_key TEXT NOT NULL,
  event_name TEXT NOT NULL,
  session_id UUID,
  user_id UUID REFERENCES auth.users(id),
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_experiment_events_experiment_key ON experiment_events(experiment_key);
CREATE INDEX IF NOT EXISTS idx_experiment_events_created_at ON experiment_events(created_at DESC);
