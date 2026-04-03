-- Migration 019: Missing tables and columns per implementation plan Step 2
-- Adds: monetization_products, monetization_events, notifications,
--       service_requests_backlog, executor_type/handoff_channel/service_case_id columns

-- ── mission_instances: executor_type, handoff_channel, service_case_id, reminder_sent_at ────

ALTER TABLE mission_instances
  ADD COLUMN IF NOT EXISTS executor_type    TEXT NOT NULL DEFAULT 'guided_llm',
  ADD COLUMN IF NOT EXISTS handoff_channel  TEXT NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS service_case_id  TEXT,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- ── mission_steps: executor_type, handoff_channel, service_case_id ────────────────────────

ALTER TABLE mission_steps
  ADD COLUMN IF NOT EXISTS executor_type   TEXT NOT NULL DEFAULT 'guided_llm',
  ADD COLUMN IF NOT EXISTS handoff_channel TEXT NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS service_case_id TEXT;

-- ── monetization_products ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS monetization_products (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  type          TEXT        NOT NULL CHECK (type IN ('service','digital_product','membership','affiliate','brand_deal','course')),
  price_amount  NUMERIC(12,2),
  price_currency TEXT       NOT NULL DEFAULT 'EUR',
  status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  platform      TEXT,
  url           TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monetization_products_project_id ON monetization_products(project_id);
CREATE INDEX IF NOT EXISTS idx_monetization_products_status     ON monetization_products(project_id, status);

ALTER TABLE monetization_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner access" ON monetization_products;
CREATE POLICY "owner access" ON monetization_products
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ── monetization_events ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS monetization_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id  UUID        REFERENCES monetization_products(id) ON DELETE SET NULL,
  event_type  TEXT        NOT NULL CHECK (event_type IN ('sale','refund','subscription_start','subscription_cancel','lead','inquiry')),
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency    TEXT        NOT NULL DEFAULT 'EUR',
  source      TEXT        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','stripe_webhook','llm_inferred')),
  note        TEXT,
  event_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monetization_events_project_id ON monetization_events(project_id);
CREATE INDEX IF NOT EXISTS idx_monetization_events_event_date  ON monetization_events(project_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_events_type        ON monetization_events(project_id, event_type);

ALTER TABLE monetization_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner read insert" ON monetization_events;
CREATE POLICY "owner read insert" ON monetization_events
  FOR SELECT USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "owner insert only" ON monetization_events;
CREATE POLICY "owner insert only" ON monetization_events
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ── notifications ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL CHECK (type IN ('mission_reminder','publish_success','publish_failed','weekly_digest','capability_followup')),
  title            TEXT        NOT NULL,
  body             TEXT        NOT NULL,
  delivery_channel TEXT        NOT NULL DEFAULT 'in_app' CHECK (delivery_channel IN ('email','in_app')),
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at          TIMESTAMPTZ,
  metadata_json    JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id    ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_project_id ON notifications(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner access" ON notifications;
CREATE POLICY "owner access" ON notifications
  USING (user_id = auth.uid());

-- ── service_requests_backlog ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_requests_backlog (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  intent_type  TEXT        NOT NULL,
  context_json JSONB,
  status       TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','resolved','dismissed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_to  TEXT,
  resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_requests_project_id ON service_requests_backlog(project_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status     ON service_requests_backlog(status);

ALTER TABLE service_requests_backlog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner access" ON service_requests_backlog;
CREATE POLICY "owner access" ON service_requests_backlog
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
