-- brain_facts_history: audit log of every fact write (non-negotiable per business spec)
-- Table was partially created in a prior migration; this migration completes the implementation.

CREATE TABLE IF NOT EXISTS brain_facts_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fact_key     TEXT        NOT NULL,
  old_value    JSONB,                          -- NULL on initial INSERT
  new_value    JSONB       NOT NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by   TEXT        NOT NULL DEFAULT 'system',
  reason       TEXT
);

CREATE INDEX IF NOT EXISTS idx_brain_facts_history_project_id ON brain_facts_history(project_id);
CREATE INDEX IF NOT EXISTS idx_brain_facts_history_fact_key   ON brain_facts_history(project_id, fact_key);
CREATE INDEX IF NOT EXISTS idx_brain_facts_history_changed_at ON brain_facts_history(changed_at DESC);

-- ── Replace trigger function: fire on INSERT + UPDATE, capture changed_by ────

CREATE OR REPLACE FUNCTION fn_brain_facts_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO brain_facts_history (project_id, fact_key, old_value, new_value, changed_at, changed_by)
    VALUES (NEW.project_id, NEW.fact_key, NULL, NEW.value, NOW(), COALESCE(NEW.source, 'system'));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO brain_facts_history (project_id, fact_key, old_value, new_value, changed_at, changed_by)
    VALUES (NEW.project_id, NEW.fact_key, OLD.value, NEW.value, NOW(), COALESCE(NEW.source, 'system'));
  END IF;
  RETURN NEW;
END;
$$;

-- Drop old trigger (UPDATE only) and recreate for INSERT OR UPDATE
DROP TRIGGER IF EXISTS trg_brain_facts_history ON brain_facts;

CREATE TRIGGER trg_brain_facts_history
  AFTER INSERT OR UPDATE ON brain_facts
  FOR EACH ROW EXECUTE FUNCTION fn_brain_facts_history();
