-- Migration 023: Event Tracking System - Data Dictionary Foundation
-- Brief 1: Data Dictionary + Event Tracking
-- Implements event definitions, tracking configuration, and audit logging

-- ============================================================
-- Event Definitions Table
-- ============================================================
-- Catalog of all system events with metadata and validation schemas
-- Used to validate events before logging and configure PII handling

CREATE TABLE IF NOT EXISTS event_definitions (
  event_definition_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT UNIQUE NOT NULL,
  event_category TEXT NOT NULL CHECK (event_category IN (
    'user',
    'payment',
    'mission',
    'brain',
    'content',
    'system',
    'auth',
    'error',
    'engagement'
  )),
  display_name TEXT NOT NULL,
  description TEXT,
  event_schema JSONB NOT NULL DEFAULT '{}',
  pii_fields TEXT[] DEFAULT '{}',
  retention_days INTEGER NOT NULL DEFAULT 90,
  sampling_rate DECIMAL(3,2) DEFAULT 1.0,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_definitions_type ON event_definitions(event_type);
CREATE INDEX IF NOT EXISTS idx_event_definitions_category ON event_definitions(event_category);

-- ============================================================
-- Event Tracking Configuration Table
-- ============================================================
-- Per-event tracking settings for user consent and preferences

CREATE TABLE IF NOT EXISTS event_tracking_config (
  config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL REFERENCES event_definitions(event_type),
  tracking_enabled BOOLEAN DEFAULT true,
  consent_given BOOLEAN DEFAULT false,
  consent_version TEXT,
  consent_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_event_tracking_config_user ON event_tracking_config(user_id);
CREATE INDEX IF NOT EXISTS idx_event_tracking_config_event ON event_tracking_config(event_type);

-- ============================================================
-- Core Event Log Table
-- ============================================================
-- Immutable audit log of all system events
-- All events append-only, retains correlation_id for request tracing

CREATE TABLE IF NOT EXISTS core_event_log (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL REFERENCES event_definitions(event_type),
  user_id UUID REFERENCES auth.users(id),
  project_id UUID REFERENCES projects(id),
  correlation_id TEXT,
  trace_id TEXT,
  span_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  payload_masked JSONB NOT NULL DEFAULT '{}',
  http_method TEXT,
  http_path TEXT,
  http_status_code INTEGER,
  source TEXT CHECK (source IN ('api', 'edge_function', 'n8n', 'webhook', 'internal')),
  ip_address INET,
  user_agent TEXT,
  severity TEXT CHECK (severity IN ('info', 'warning', 'error', 'critical')) DEFAULT 'info',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Partition by date for efficient retention cleanup
  created_date DATE GENERATED ALWAYS AS (created_at::date) STORED
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_event_log_user_created ON core_event_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_type_created ON core_event_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_project_created ON core_event_log(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_correlation ON core_event_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_event_log_created_date ON core_event_log(created_date);
CREATE INDEX IF NOT EXISTS idx_event_log_severity ON core_event_log(severity);

-- ============================================================
-- Event Retention Policy
-- ============================================================
-- Auto-delete old events based on retention_days configuration

CREATE TABLE IF NOT EXISTS event_retention_policy (
  policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL REFERENCES event_definitions(event_type),
  retention_days INTEGER NOT NULL,
  delete_after_days INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_type)
);

CREATE INDEX IF NOT EXISTS idx_retention_policy_event ON event_retention_policy(event_type);

-- ============================================================
-- PII Masking Rules
-- ============================================================
-- Define which fields should be masked and how

CREATE TABLE IF NOT EXISTS pii_masking_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name TEXT NOT NULL UNIQUE,
  masking_strategy TEXT NOT NULL CHECK (masking_strategy IN (
    'hash',
    'redact',
    'tokenize',
    'hide_partial',
    'remove'
  )),
  pattern TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed standard PII fields
INSERT INTO pii_masking_rules (field_name, masking_strategy) VALUES
  ('email', 'tokenize'),
  ('phone', 'hide_partial'),
  ('password', 'redact'),
  ('credit_card', 'hide_partial'),
  ('ssn', 'hide_partial'),
  ('full_name', 'tokenize'),
  ('ip_address', 'hide_partial'),
  ('user_id', 'tokenize'),
  ('session_id', 'redact'),
  ('auth_token', 'redact')
ON CONFLICT (field_name) DO NOTHING;

-- ============================================================
-- Seed Event Definitions
-- ============================================================

INSERT INTO event_definitions (
  event_type,
  event_category,
  display_name,
  description,
  event_schema,
  pii_fields,
  retention_days,
  enabled
) VALUES
-- User Events
('user_signup', 'user', 'User Sign Up', 'New user registered', 
  '{"email":"string","name":"string","source":"string"}'::jsonb, 
  ARRAY['email','name'], 90, true),

('user_login', 'auth', 'User Login', 'User authenticated successfully', 
  '{"email":"string","method":"string"}'::jsonb, 
  ARRAY['email'], 90, true),

('user_logout', 'auth', 'User Logout', 'User logged out', 
  '{"user_id":"uuid"}'::jsonb, 
  ARRAY[], 90, true),

-- Payment Events
('stripe_checkout_created', 'payment', 'Stripe Checkout Created', 'Payment session initiated', 
  '{"session_id":"string","amount_eur":"number","plan":"string"}'::jsonb, 
  ARRAY[], 180, true),

('stripe_payment_completed', 'payment', 'Payment Completed', 'Charge completed successfully', 
  '{"charge_id":"string","amount_eur":"number","plan":"string"}'::jsonb, 
  ARRAY[], 180, true),

('stripe_payment_failed', 'payment', 'Payment Failed', 'Charge declined', 
  '{"charge_id":"string","error_code":"string","error_message":"string"}'::jsonb, 
  ARRAY[], 180, true),

-- Mission Events
('mission_started', 'mission', 'Mission Started', 'User started a mission', 
  '{"mission_id":"uuid","mission_type":"string","user_id":"uuid"}'::jsonb, 
  ARRAY[], 90, true),

('mission_completed', 'mission', 'Mission Completed', 'User completed a mission', 
  '{"mission_id":"uuid","mission_type":"string","duration_minutes":"number","credits_earned":"number"}'::jsonb, 
  ARRAY[], 90, true),

('mission_abandoned', 'mission', 'Mission Abandoned', 'User abandoned a mission', 
  '{"mission_id":"uuid","mission_type":"string","reason":"string"}'::jsonb, 
  ARRAY[], 90, true),

-- Brain Events
('brain_update_started', 'brain', 'Brain Update Started', 'Brain analysis initiated', 
  '{"user_id":"uuid","project_id":"uuid","trigger":"string"}'::jsonb, 
  ARRAY[], 90, true),

('brain_update_completed', 'brain', 'Brain Update Completed', 'Brain analysis finished', 
  '{"user_id":"uuid","phase":"string","signals_count":"number","execution_time_ms":"number"}'::jsonb, 
  ARRAY[], 90, true),

('brain_facts_added', 'brain', 'Brain Facts Added', 'New facts processed', 
  '{"facts_count":"number","source":"string"}'::jsonb, 
  ARRAY[], 90, true),

-- Content Events
('content_published', 'content', 'Content Published', 'Content published to calendar', 
  '{"content_id":"uuid","content_type":"string","medium":"string"}'::jsonb, 
  ARRAY[], 90, true),

('content_scraped', 'engagement', 'Content Scraped', 'External content scraped', 
  '{"url":"string","domain":"string","posts_count":"number"}'::jsonb, 
  ARRAY['url'], 90, true),

-- System Events
('system_health_check', 'system', 'System Health Check', 'Periodic system status check', 
  '{"database":"string","api":"string","n8n":"string","cache":"string"}'::jsonb, 
  ARRAY[], 30, true),

('error_occurred', 'error', 'Error Occurred', 'Application error captured', 
  '{"error_code":"string","error_message":"string","stack_trace":"string","severity":"string"}'::jsonb, 
  ARRAY[], 180, true),

('rate_limit_exceeded', 'error', 'Rate Limit Exceeded', 'User exceeded rate limit', 
  '{"user_id":"uuid","endpoint":"string","limit":"number","reset_after_seconds":"number"}'::jsonb, 
  ARRAY[], 90, true),

-- Engagement Events
('feature_accessed', 'engagement', 'Feature Accessed', 'User accessed a feature', 
  '{"feature_name":"string","feature_category":"string"}'::jsonb, 
  ARRAY[], 90, true),

('button_clicked', 'engagement', 'Button Clicked', 'User clicked UI element', 
  '{"button_name":"string","page":"string","section":"string"}'::jsonb, 
  ARRAY[], 90, true)
ON CONFLICT (event_type) DO NOTHING;

-- ============================================================
-- RLS Policies
-- ============================================================

-- Users can only see their own event logs
ALTER TABLE core_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_log_user_read ON core_event_log
  FOR SELECT
  USING (user_id = auth.uid())
  WITH CHECK (false);

-- Admins can see all event logs
CREATE POLICY event_log_admin_read ON core_event_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND (raw_user_meta_data->>'role' = 'admin' OR email LIKE '%@glimad.com%')
    )
  );

-- Events can only be inserted (append-only)
CREATE POLICY event_log_insert ON core_event_log
  FOR INSERT
  WITH CHECK (true);

-- Tracking config is user-specific
ALTER TABLE event_tracking_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY tracking_config_user_read_write ON event_tracking_config
  FOR ALL
  USING (user_id = auth.uid());

-- Event definitions are public read-only
ALTER TABLE event_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_definitions_public_read ON event_definitions
  FOR SELECT
  USING (true);
