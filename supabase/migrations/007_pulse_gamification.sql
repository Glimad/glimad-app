-- ============================================================
-- Step 14: Daily Pulse - add action_items to pulse_runs
-- Step 16: Gamification - xp_reward on mission_templates, STREAK_BONUS ledger reason
-- ============================================================

-- Add action_items and phase_code to pulse_runs
ALTER TABLE pulse_runs
  ADD COLUMN IF NOT EXISTS action_items JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS phase_code TEXT;

-- Gamification: xp_reward on mission_templates
ALTER TABLE mission_templates
  ADD COLUMN IF NOT EXISTS xp_reward INTEGER NOT NULL DEFAULT 50;

-- Initialize streak_freezes_available as 2 via brain_facts is done in code.
-- No new table needed for gamification per implementation plan.

-- Ledger reason for streak bonus
INSERT INTO core_ledger_reasons (reason_key, description, type)
VALUES ('STREAK_BONUS', 'Streak milestone bonus credits', 'premium')
ON CONFLICT (reason_key) DO NOTHING;

-- RLS on pulse_runs (already enabled in 001 or enable now)
ALTER TABLE pulse_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pulse runs" ON pulse_runs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = pulse_runs.project_id AND projects.user_id = auth.uid()
  ));
