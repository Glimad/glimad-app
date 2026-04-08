-- Migration 022: Fix mission template brain_read steps to use canonical brain fact keys
-- All 5 Core Flow templates use old flat keys (niche_raw, primary_goal, etc.)
-- Replace with fact_extract config that maps canonical keys to template variable names

-- VISION_PURPOSE_MOODBOARD_V1 step 1
UPDATE mission_templates
SET steps_json = jsonb_set(
  steps_json,
  '{0,config}',
  '{
    "facts": [],
    "fact_extract": {
      "identity.niche":                  { "as": "niche_raw",         "field": "niche" },
      "identity.primary_goal":           { "as": "primary_goal" },
      "identity.main_blocker":           { "as": "main_blocker" },
      "capabilities.on_camera_comfort":  { "as": "on_camera_comfort" }
    }
  }'::jsonb
)
WHERE template_code = 'VISION_PURPOSE_MOODBOARD_V1';

-- CONTENT_COMFORT_STYLE_V1 step 1
UPDATE mission_templates
SET steps_json = jsonb_set(
  steps_json,
  '{0,config}',
  '{
    "facts": ["vision_statement", "creative_purpose"],
    "fact_extract": {
      "identity.niche":                  { "as": "niche_raw",         "field": "niche" },
      "identity.primary_goal":           { "as": "primary_goal" },
      "capabilities.on_camera_comfort":  { "as": "on_camera_comfort" }
    }
  }'::jsonb
)
WHERE template_code = 'CONTENT_COMFORT_STYLE_V1';

-- PLATFORM_STRATEGY_PICKER_V1 step 1
UPDATE mission_templates
SET steps_json = jsonb_set(
  steps_json,
  '{0,config}',
  '{
    "facts": [],
    "fact_extract": {
      "identity.niche":                      { "as": "niche_raw",          "field": "niche" },
      "platforms.focus":                     { "as": "current_platforms",  "field": "platform", "as_array": true },
      "capabilities.weekly_hours_available": { "as": "hours_per_week" },
      "capabilities.on_camera_comfort":      { "as": "on_camera_comfort" }
    }
  }'::jsonb
)
WHERE template_code = 'PLATFORM_STRATEGY_PICKER_V1';

-- NICHE_CONFIRM_V1 step 1
UPDATE mission_templates
SET steps_json = jsonb_set(
  steps_json,
  '{0,config}',
  '{
    "facts": [],
    "fact_extract": {
      "identity.niche":        { "as": "niche_raw",          "field": "niche" },
      "identity.primary_goal": { "as": "primary_goal" },
      "identity.main_blocker": { "as": "main_blocker" },
      "platforms.focus":       { "as": "current_platforms",  "field": "platform", "as_array": true }
    }
  }'::jsonb
)
WHERE template_code = 'NICHE_CONFIRM_V1';

-- PREFERENCES_CAPTURE_V1 step 1
UPDATE mission_templates
SET steps_json = jsonb_set(
  steps_json,
  '{0,config}',
  '{
    "facts": [],
    "fact_extract": {
      "capabilities.on_camera_comfort":      { "as": "on_camera_comfort" },
      "capabilities.weekly_hours_available": { "as": "hours_per_week" },
      "platforms.focus":                     { "as": "focus_platform", "field": "platform" }
    }
  }'::jsonb
)
WHERE template_code = 'PREFERENCES_CAPTURE_V1';
