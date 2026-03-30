-- ============================================================
-- Step 18: Admin Panel — is_admin flag, feature_flags table
-- ============================================================

-- Admin flag on projects (simpler than separate profiles table)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Feature flags table
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE, -- NULL = global
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(flag_key, project_id)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(flag_key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_project ON feature_flags(project_id);

-- Seed some default global flags
INSERT INTO feature_flags (flag_key, enabled, project_id, description)
VALUES
  ('scrape_light_enabled', true, NULL, 'Enable Scrape Light feature globally'),
  ('batch_content_enabled', false, NULL, 'Enable batch content generation'),
  ('ai_coach_enabled', false, NULL, 'Enable AI coach chat feature')
ON CONFLICT (flag_key, project_id) DO NOTHING;
