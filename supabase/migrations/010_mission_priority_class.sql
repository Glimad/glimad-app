-- Migration 010: Add priority_class to mission_templates
-- P0=100 (Core Flow), P1=80 (rescue), P2=60 (execution/planning), P3-P5 reserved

ALTER TABLE mission_templates ADD COLUMN IF NOT EXISTS priority_class smallint NOT NULL DEFAULT 2;

-- Core Flow missions → P0
UPDATE mission_templates SET priority_class = 0
WHERE template_code IN (
  'VISION_PURPOSE_MOODBOARD_V1',
  'NICHE_CONFIRM_V1',
  'PLATFORM_STRATEGY_PICKER_V1',
  'PREFERENCES_CAPTURE_V1'
);

-- Rescue missions → P1
UPDATE mission_templates SET priority_class = 1
WHERE template_code IN ('ENGAGEMENT_RESCUE_V1');

-- Execution / planning missions → P2
UPDATE mission_templates SET priority_class = 2
WHERE template_code IN ('CONTENT_BATCH_3D_V1', 'DEFINE_OFFER_V1');
