-- Migration 014: Rename waiting_input → needs_user_input on mission_instances
--               Add awaiting_input status to mission_steps

-- mission_instances: drop old constraint, migrate rows, add new constraint
ALTER TABLE mission_instances
  DROP CONSTRAINT IF EXISTS mission_instances_status_check;

UPDATE mission_instances
  SET status = 'needs_user_input'
  WHERE status = 'waiting_input';

ALTER TABLE mission_instances
  ADD CONSTRAINT mission_instances_status_check
  CHECK (status IN ('queued', 'running', 'needs_user_input', 'completed', 'failed', 'canceled'));

-- mission_steps: drop old constraint, add new one with awaiting_input
ALTER TABLE mission_steps
  DROP CONSTRAINT IF EXISTS mission_steps_status_check;

ALTER TABLE mission_steps
  ADD CONSTRAINT mission_steps_status_check
  CHECK (status IN ('pending', 'running', 'awaiting_input', 'completed', 'failed', 'skipped'));
