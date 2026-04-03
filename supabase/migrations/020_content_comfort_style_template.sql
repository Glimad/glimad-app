-- Migration 020: Add CONTENT_COMFORT_STYLE_V1 — 2nd Core Flow mission
-- Captures: content style, face/no-face comfort, brand tone

INSERT INTO mission_templates (
  template_code, name, description, type,
  phase_min, phase_max,
  credit_cost_allowance, credit_cost_premium,
  estimated_minutes, cooldown_hours,
  priority_class,
  steps_json, params_schema, active
) VALUES

('CONTENT_COMFORT_STYLE_V1',
 'Estilo y Límites de Contenido',
 'Define tu zona de confort creativa: tono de marca, estilo visual y límites de contenido',
 'discovery',
 'F0', 'F7',
 5, 0, 8, 336,
 1,
 '[
   {"step_number":1,"step_type":"brain_read","name":"Read context","config":{"facts":["niche_raw","primary_goal","on_camera_comfort","vision_statement","creative_purpose"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":2,"step_type":"llm_text","name":"Generate style profile","config":{"prompt_key":"CONTENT_COMFORT_STYLE_V1","model":"haiku"},"timeout_seconds":30,"retry_max":2,"skip_on_failure":false,"requires_credit":true,"credit_type":"allowance","credit_amount":5},
   {"step_number":3,"step_type":"user_input","name":"Confirm style","config":{"fields":["brand_tone","content_style","face_visibility_confirmed"]},"timeout_seconds":259200,"retry_max":0,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":4,"step_type":"brain_update","name":"Save style","config":{"facts":["brand_tone","content_style","face_visibility_confirmed"],"signals":["content_style_defined"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":5,"step_type":"finalize","name":"Complete","config":{},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0}
 ]'::jsonb,
 '{}'::jsonb,
 true)

ON CONFLICT (template_code) DO NOTHING;
