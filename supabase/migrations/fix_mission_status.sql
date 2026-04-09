ALTER TABLE mission_instances DROP CONSTRAINT IF EXISTS mission_instances_status_check;

ALTER TABLE mission_instances ADD CONSTRAINT mission_instances_status_check 
CHECK (status IN ('queued','running','waiting_input','completed','failed','cancelled'));

UPDATE mission_instances SET status = 'waiting_input' WHERE status = 'needs_user_input';
