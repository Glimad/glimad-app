-- Fix brain_update facts configs across all mission templates
-- Aligns facts[] with actual LLM output schema keys and user_input fields.
-- Also fixes the critical DEFINE_OFFER_V1 bug (offer_defined/offer_details → real keys).

-- VISION_PURPOSE_MOODBOARD_V1: add referents, key_message
UPDATE mission_templates
SET steps_json = (
  SELECT jsonb_agg(step ORDER BY (step->>'step_number')::int)
  FROM (
    SELECT
      CASE WHEN step->>'step_type' = 'brain_update' THEN
        jsonb_set(step, '{config,facts}', '["vision_statement","creative_purpose","referents","key_message"]'::jsonb)
      ELSE step END AS step
    FROM jsonb_array_elements(steps_json) AS step
  ) t
)
WHERE template_code = 'VISION_PURPOSE_MOODBOARD_V1';

-- NICHE_CONFIRM_V1: add content_pillars
UPDATE mission_templates
SET steps_json = (
  SELECT jsonb_agg(step ORDER BY (step->>'step_number')::int)
  FROM (
    SELECT
      CASE WHEN step->>'step_type' = 'brain_update' THEN
        jsonb_set(step, '{config,facts}', '["niche","audience_persona","positioning","content_pillars"]'::jsonb)
      ELSE step END AS step
    FROM jsonb_array_elements(steps_json) AS step
  ) t
)
WHERE template_code = 'NICHE_CONFIRM_V1';

-- PLATFORM_STRATEGY_PICKER_V1: add satellite_platforms
UPDATE mission_templates
SET steps_json = (
  SELECT jsonb_agg(step ORDER BY (step->>'step_number')::int)
  FROM (
    SELECT
      CASE WHEN step->>'step_type' = 'brain_update' THEN
        jsonb_set(step, '{config,facts}', '["focus_platform","focus_platform_handle","posting_frequency","satellite_platforms"]'::jsonb)
      ELSE step END AS step
    FROM jsonb_array_elements(steps_json) AS step
  ) t
)
WHERE template_code = 'PLATFORM_STRATEGY_PICKER_V1';

-- PREFERENCES_CAPTURE_V1: add energy_level, batch_preference, collaboration_style
UPDATE mission_templates
SET steps_json = (
  SELECT jsonb_agg(step ORDER BY (step->>'step_number')::int)
  FROM (
    SELECT
      CASE WHEN step->>'step_type' = 'brain_update' THEN
        jsonb_set(step, '{config,facts}', '["content_formats","best_posting_times","energy_level","batch_preference","collaboration_style"]'::jsonb)
      ELSE step END AS step
    FROM jsonb_array_elements(steps_json) AS step
  ) t
)
WHERE template_code = 'PREFERENCES_CAPTURE_V1';

-- ENGAGEMENT_RESCUE_V1: add facts ["accepted_actions"] (from user_input step)
UPDATE mission_templates
SET steps_json = (
  SELECT jsonb_agg(step ORDER BY (step->>'step_number')::int)
  FROM (
    SELECT
      CASE WHEN step->>'step_type' = 'brain_update' THEN
        jsonb_set(step, '{config,facts}', '["accepted_actions"]'::jsonb)
      ELSE step END AS step
    FROM jsonb_array_elements(steps_json) AS step
  ) t
)
WHERE template_code = 'ENGAGEMENT_RESCUE_V1';

-- DEFINE_OFFER_V1 (critical): replace broken offer_defined/offer_details with real LLM output keys
-- and add full_output_key so the entire output is saved as "offer_details"
UPDATE mission_templates
SET steps_json = (
  SELECT jsonb_agg(step ORDER BY (step->>'step_number')::int)
  FROM (
    SELECT
      CASE WHEN step->>'step_type' = 'brain_update' THEN
        jsonb_set(
          jsonb_set(step,
            '{config,facts}',
            '["offer_title","offer_type","offer_price","offer_audience","offer_cta","value_proposition"]'::jsonb
          ),
          '{config,full_output_key}',
          '"offer_details"'::jsonb
        )
      ELSE step END AS step
    FROM jsonb_array_elements(steps_json) AS step
  ) t
)
WHERE template_code = 'DEFINE_OFFER_V1';

-- BATCH_CONFIG_V1: remove posting_frequency (not in LLM output), add batch_size, best_posting_times, formats_rotation
UPDATE mission_templates
SET steps_json = (
  SELECT jsonb_agg(step ORDER BY (step->>'step_number')::int)
  FROM (
    SELECT
      CASE WHEN step->>'step_type' = 'brain_update' THEN
        jsonb_set(step, '{config,facts}', '["posts_per_week","batch_size","best_posting_times","formats_rotation"]'::jsonb)
      ELSE step END AS step
    FROM jsonb_array_elements(steps_json) AS step
  ) t
)
WHERE template_code = 'BATCH_CONFIG_V1';

-- BRAND_KIT_LITE_V1: add tone_of_voice (captured from user_input step)
UPDATE mission_templates
SET steps_json = (
  SELECT jsonb_agg(step ORDER BY (step->>'step_number')::int)
  FROM (
    SELECT
      CASE WHEN step->>'step_type' = 'brain_update' THEN
        jsonb_set(step, '{config,facts}', '["brand_name","tone_of_voice"]'::jsonb)
      ELSE step END AS step
    FROM jsonb_array_elements(steps_json) AS step
  ) t
)
WHERE template_code = 'BRAND_KIT_LITE_V1';
