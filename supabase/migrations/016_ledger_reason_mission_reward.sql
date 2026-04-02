-- Add missing ledger reason for mission completion premium credit grant
INSERT INTO core_ledger_reasons (reason_key, description, type)
VALUES ('MISSION_COMPLETION_REWARD', 'Premium credit reward for completing a mission', 'premium')
ON CONFLICT (reason_key) DO NOTHING;
