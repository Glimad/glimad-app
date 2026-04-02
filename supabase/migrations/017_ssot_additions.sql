-- Migration 017: SSOT additions
-- Adds: brain_facts_history + trigger, monetization tables,
--       notifications, service_requests_backlog,
--       executor_type/handoff_channel/service_case_id on mission tables

-- ============================================================
-- BRAIN FACTS HISTORY (audit log, append-only)
-- ============================================================

CREATE TABLE IF NOT EXISTS brain_facts_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fact_key TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by TEXT,  -- 'system' | 'mission:<template_code>' | 'user' | 'engine'
  reason TEXT
);

CREATE INDEX idx_brain_facts_history_project_id ON brain_facts_history(project_id, changed_at DESC);
CREATE INDEX idx_brain_facts_history_fact_key ON brain_facts_history(project_id, fact_key);

ALTER TABLE brain_facts_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_brain_facts_history" ON brain_facts_history
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- DB trigger: record old/new value on every UPDATE of brain_facts
CREATE OR REPLACE FUNCTION fn_brain_facts_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO brain_facts_history(project_id, fact_key, old_value, new_value, changed_at)
  VALUES (NEW.project_id, NEW.fact_key, OLD.value, NEW.value, NOW());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_brain_facts_history ON brain_facts;
CREATE TRIGGER trg_brain_facts_history
  AFTER UPDATE ON brain_facts
  FOR EACH ROW
  WHEN (OLD.value IS DISTINCT FROM NEW.value)
  EXECUTE FUNCTION fn_brain_facts_history();

-- ============================================================
-- MONETIZATION CENTER
-- ============================================================

CREATE TABLE IF NOT EXISTS monetization_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('service','digital_product','membership','affiliate','brand_deal','course')) NOT NULL,
  price_amount NUMERIC(12,2),
  price_currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT CHECK (status IN ('active','paused','archived')) NOT NULL DEFAULT 'active',
  platform TEXT,
  url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_monetization_products_project_id ON monetization_products(project_id);
CREATE INDEX idx_monetization_products_status ON monetization_products(project_id, status);

ALTER TABLE monetization_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_monetization_products" ON monetization_products
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Revenue events: append-only
CREATE TABLE IF NOT EXISTS monetization_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id UUID REFERENCES monetization_products(id) ON DELETE SET NULL,
  event_type TEXT CHECK (event_type IN ('sale','refund','subscription_start','subscription_cancel','lead','inquiry')) NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  source TEXT CHECK (source IN ('manual','stripe_webhook','llm_inferred')) NOT NULL DEFAULT 'manual',
  note TEXT,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_monetization_events_project_id ON monetization_events(project_id, event_date DESC);
CREATE INDEX idx_monetization_events_product_id ON monetization_events(product_id);

ALTER TABLE monetization_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_monetization_events_select" ON monetization_events
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
CREATE POLICY "owner_monetization_events_insert" ON monetization_events
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('mission_reminder','publish_success','publish_failed','weekly_digest','capability_followup')) NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  delivery_channel TEXT CHECK (delivery_channel IN ('email','in_app')) NOT NULL DEFAULT 'in_app',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_project_id ON notifications(project_id, created_at DESC);
CREATE INDEX idx_notifications_user_id ON notifications(user_id, read_at);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_notifications" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- SERVICE REQUESTS BACKLOG (Expert mode hook)
-- ============================================================

CREATE TABLE IF NOT EXISTS service_requests_backlog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  intent_type TEXT NOT NULL,  -- e.g. 'expert_review', 'content_production', 'brand_outreach'
  context_json JSONB NOT NULL DEFAULT '{}',
  status TEXT CHECK (status IN ('pending','assigned','resolved','canceled')) NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_to TEXT,  -- email or internal user ref
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_service_requests_project_id ON service_requests_backlog(project_id, status);

ALTER TABLE service_requests_backlog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_service_requests" ON service_requests_backlog
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- ============================================================
-- MISSION EXECUTOR HOOKS (Services/Expert minimal)
-- ============================================================

ALTER TABLE mission_instances
  ADD COLUMN IF NOT EXISTS executor_type TEXT
    CHECK (executor_type IN ('guided_llm','dfy_ai','expert'))
    NOT NULL DEFAULT 'guided_llm',
  ADD COLUMN IF NOT EXISTS handoff_channel TEXT
    CHECK (handoff_channel IN ('in_app','whatsapp','email','tel'))
    NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS service_case_id UUID;

ALTER TABLE mission_steps
  ADD COLUMN IF NOT EXISTS executor_type TEXT
    CHECK (executor_type IN ('guided_llm','dfy_ai','expert'))
    NOT NULL DEFAULT 'guided_llm',
  ADD COLUMN IF NOT EXISTS handoff_channel TEXT
    CHECK (handoff_channel IN ('in_app','whatsapp','email','tel'))
    NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS service_case_id UUID;

-- ============================================================
-- PHASE ENGINE RECALCULATION GUARDRAIL
-- Add input_hash to core_phase_runs if not exists
-- ============================================================

ALTER TABLE core_phase_runs
  ADD COLUMN IF NOT EXISTS input_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_core_phase_runs_project_hash
  ON core_phase_runs(project_id, input_hash);
