-- Migration 031: WEBSITE_FOCO_CONFIRM_V1 mission template (Fix 3 / Phase 3)
--
-- Used when a user signs up with a website URL but no social FOCO platform.
-- brain-seed populates website.scrape + website.inference via the Phase 2
-- scrape+Haiku pipeline; this mission asks the user to confirm the suggested
-- focus platform and niche before any canonical writes to platforms.focus /
-- platforms.satellites / identity.niche happen.
--
-- Steps:
--   1. brain_read   — pull website.url, website.inference, identity.*, platforms.all
--   2. user_input   — user confirms platform / handle / satellites / niche details
--   3. brain_update — write canonical dotted facts + signals
--   4. finalize
--
-- No llm_text step: the inference already happened at onboarding-seed time and is
-- stored in brain_facts["website.inference"]. The UI pre-fills user_input fields
-- from that fact. User-submitted payload uses dotted keys (platforms.focus,
-- platforms.satellites, identity.niche) so brain_update writes them verbatim.

INSERT INTO mission_templates (
  template_code, name, description, type,
  phase_min, phase_max,
  credit_cost_allowance, credit_cost_premium,
  estimated_minutes, cooldown_hours,
  steps_json, params_schema, active
) VALUES

('WEBSITE_FOCO_CONFIRM_V1',
 'Confirmar Plataforma y Nicho (desde sitio web)',
 'Confirma la plataforma foco y el nicho sugerido a partir del análisis de tu sitio web',
 'discovery',
 'F0', 'F7',
 0, 0, 6, 336,
 '[
   {"step_number":1,"step_type":"brain_read","name":"Read website inference","config":{"facts":["website.url","website.inference","website.scrape","identity.project_type","identity.vision","identity.niche","platforms.all"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":2,"step_type":"user_input","name":"Confirm FOCO and niche","config":{"fields":["platforms.focus","platforms.satellites","identity.niche"],"user_prompt":"Confirma tu plataforma foco y nicho basado en el análisis de tu sitio web."},"timeout_seconds":259200,"retry_max":0,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":3,"step_type":"brain_update","name":"Write canonical facts","config":{"facts":["platforms.focus","platforms.satellites","identity.niche"],"signals":["platform_selected","niche_confirmed","foco_confirmed_from_website"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":4,"step_type":"finalize","name":"Complete","config":{},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0}
 ]'::jsonb,
 '{}'::jsonb,
 true)

ON CONFLICT (template_code) DO NOTHING;
