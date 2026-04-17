-- ============================================================
-- Brief 29: Developer Cost Tracking & Validation (v0)
-- Per-operation cost log for COGS validation against Finance model
-- ============================================================

-- dev_cost_log: append-only per-operation cost record
-- Used to measure actual COGS vs Finance assumptions
CREATE TABLE IF NOT EXISTS dev_cost_log (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type  TEXT          NOT NULL,  -- 'llm_light', 'llm_power', 'scrape_refresh', 'content_lab', etc.
  project_id      UUID          REFERENCES projects(id) ON DELETE SET NULL,
  user_id         UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  plan_code       TEXT          REFERENCES core_plans(plan_code) ON DELETE SET NULL,

  -- Costs
  cost_eur        DECIMAL(10,4) NOT NULL,
  credits_consumed INT,
  cost_per_credit_eur DECIMAL(10,4),

  -- Technical metrics
  duration_ms     INT,
  tokens_input    INT,
  tokens_output   INT,
  tokens_total    INT GENERATED ALWAYS AS (COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)) STORED,
  retry_count     INT           NOT NULL DEFAULT 0,

  -- Provider info
  provider        TEXT,         -- 'anthropic', 'openai', 'apify', 'resend', 'supabase', etc.
  model           TEXT,         -- 'claude-haiku-4-5', 'claude-sonnet-4-5', 'gpt-4o-mini', etc.

  -- Tracing
  correlation_id  TEXT,
  job_id          UUID,

  -- Result
  success         BOOLEAN       NOT NULL DEFAULT true,
  error_message   TEXT,

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexes (from spec § 4)
CREATE INDEX IF NOT EXISTS idx_cost_log_operation  ON dev_cost_log(operation_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_log_plan        ON dev_cost_log(plan_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_log_project     ON dev_cost_log(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_log_user        ON dev_cost_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_log_created_at  ON dev_cost_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_log_provider    ON dev_cost_log(provider, created_at DESC);

-- RLS: developer/ops table — no access for authenticated or anon roles.
-- service_role bypasses RLS automatically in Supabase so no policy needed for it.
-- Enabling RLS with zero policies blocks all non-service_role access.
ALTER TABLE dev_cost_log ENABLE ROW LEVEL SECURITY;
