-- Migration 021: Add services preference facts to PREFERENCES_CAPTURE_V1
-- Per Step 20 (Services/Expert Hooks): capture services.preference.channel and
-- services.preference.mode_default as Brain Facts during preferences mission.
-- No UI reads these in MVP — they are written for future services layer use.

UPDATE mission_templates
SET steps_json = (
  SELECT jsonb_agg(step ORDER BY (step->>'step_number')::int)
  FROM (
    SELECT
      CASE WHEN step->>'step_type' = 'brain_update' THEN
        jsonb_set(
          step,
          '{config,facts}',
          '["content_formats","best_posting_times","energy_level","batch_preference","collaboration_style","services_preference_channel","services_preference_mode_default"]'::jsonb
        )
      ELSE step END AS step
    FROM jsonb_array_elements(steps_json) AS step
  ) t
)
WHERE template_code = 'PREFERENCES_CAPTURE_V1';
