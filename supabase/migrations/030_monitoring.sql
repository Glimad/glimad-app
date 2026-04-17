-- ============================================================
-- Brief 31: Monitoring, SLOs & Incident Response (v0)
-- Incident log and SLO breach tracking tables
-- ============================================================

-- incident_log: manual + automated incident records
CREATE TABLE IF NOT EXISTS incident_log (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT          NOT NULL,
  severity        TEXT          NOT NULL CHECK (severity IN ('P0', 'P1', 'P2', 'P3')),
  component       TEXT          NOT NULL,   -- 'payments', 'llm', 'economy', 'scraping', 'infra', 'missions'
  status          TEXT          NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open', 'acknowledged', 'resolved', 'closed')),
  trigger_source  TEXT,                     -- 'alert', 'user_report', 'manual'
  alert_rule_id   TEXT,                     -- references ALERT_RULES key
  description     TEXT,
  playbook_url    TEXT,
  acknowledged_at TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  opened_by       TEXT,                     -- email or 'system'
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_log_severity   ON incident_log(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_log_status     ON incident_log(status);
CREATE INDEX IF NOT EXISTS idx_incident_log_component  ON incident_log(component, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_log_created_at ON incident_log(created_at DESC);

-- slo_breach_log: append-only record every time an SLO is breached
CREATE TABLE IF NOT EXISTS slo_breach_log (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  slo_id          TEXT          NOT NULL,   -- references SLO_DEFINITIONS key
  component       TEXT          NOT NULL,
  measured_value  NUMERIC(10,4) NOT NULL,
  slo_target      NUMERIC(10,4) NOT NULL,
  period_minutes  INT           NOT NULL,   -- window evaluated
  incident_id     UUID          REFERENCES incident_log(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slo_breach_slo_id     ON slo_breach_log(slo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_slo_breach_created_at ON slo_breach_log(created_at DESC);

-- RLS: ops/admin only — no authenticated user access
ALTER TABLE incident_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE slo_breach_log ENABLE ROW LEVEL SECURITY;
