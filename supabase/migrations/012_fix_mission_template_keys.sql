-- Migration 012: Align mission template user_input fields with brain_update fact keys
-- NICHE_CONFIRM_V1: user_input fields must match brain_update config keys
-- brain_update saves: niche, audience_persona, positioning
-- Fix: update user_input fields from niche_confirmed/positioning_statement → niche/positioning

UPDATE mission_templates
SET steps_json = jsonb_set(
  steps_json,
  '{2,config,fields}',
  '["niche", "audience_persona", "positioning"]'::jsonb
)
WHERE template_code = 'NICHE_CONFIRM_V1';
