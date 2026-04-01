-- Migration 013: Seed F1 mission templates (AUDIENCE_PERSONA, BATCH_CONFIG, BRAND_KIT_LITE)

INSERT INTO mission_templates (
  template_code, name, description, type,
  phase_min, phase_max,
  credit_cost_allowance, credit_cost_premium,
  estimated_minutes, cooldown_hours,
  priority_class,
  steps_json, params_schema, active
) VALUES

('AUDIENCE_PERSONA_V1',
 'Audiencia Ideal',
 'Define el perfil detallado de tu seguidor ideal: edad, intereses, dolores y metas',
 'discovery',
 'F1', 'F7',
 10, 0, 10, 336,
 2,
 '[
   {"step_number":1,"step_type":"brain_read","name":"Read context","config":{"facts":["niche_raw","niche","primary_goal","on_camera_comfort","focus_platform"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":2,"step_type":"llm_text","name":"Build persona","config":{"prompt_key":"AUDIENCE_PERSONA_V1","model":"haiku"},"timeout_seconds":30,"retry_max":2,"skip_on_failure":false,"requires_credit":true,"credit_type":"allowance","credit_amount":10},
   {"step_number":3,"step_type":"user_input","name":"Confirm persona","config":{"fields":["persona_name","demographics","pain_points"]},"timeout_seconds":259200,"retry_max":0,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":4,"step_type":"brain_update","name":"Save persona","config":{"full_output_key":"audience_persona","signals":["persona_defined"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":5,"step_type":"finalize","name":"Complete","config":{},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0}
 ]'::jsonb,
 '{}'::jsonb,
 true),

('BATCH_CONFIG_V1',
 'Configurar Ritmo de Publicación',
 'Define tu calendario de publicación semanal: frecuencia, formatos y horarios óptimos',
 'planning',
 'F1', 'F7',
 10, 0, 8, 336,
 2,
 '[
   {"step_number":1,"step_type":"brain_read","name":"Read context","config":{"facts":["focus_platform","hours_per_week","audience_persona"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":2,"step_type":"llm_text","name":"Generate schedule","config":{"prompt_key":"BATCH_CONFIG_V1","model":"haiku"},"timeout_seconds":30,"retry_max":2,"skip_on_failure":false,"requires_credit":true,"credit_type":"allowance","credit_amount":10},
   {"step_number":3,"step_type":"user_input","name":"Confirm schedule","config":{"fields":["posts_per_week","best_posting_times","formats_rotation"]},"timeout_seconds":259200,"retry_max":0,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":4,"step_type":"brain_update","name":"Save config","config":{"full_output_key":"batch_config","signals":["batch_config_set"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":5,"step_type":"finalize","name":"Complete","config":{},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0}
 ]'::jsonb,
 '{}'::jsonb,
 true),

('BRAND_KIT_LITE_V1',
 'Brand Kit Básico',
 'Crea tu identidad visual y de voz: paleta, tono, pilares de contenido y estrategia de hashtags',
 'planning',
 'F1', 'F7',
 15, 0, 12, 336,
 2,
 '[
   {"step_number":1,"step_type":"brain_read","name":"Read context","config":{"facts":["niche_raw","niche","focus_platform","audience_persona","vision_statement"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":2,"step_type":"llm_text","name":"Build brand kit","config":{"prompt_key":"BRAND_KIT_LITE_V1","model":"haiku"},"timeout_seconds":30,"retry_max":2,"skip_on_failure":false,"requires_credit":true,"credit_type":"allowance","credit_amount":15},
   {"step_number":3,"step_type":"user_input","name":"Confirm brand kit","config":{"fields":["tone_of_voice","content_pillars","hashtag_strategy"]},"timeout_seconds":259200,"retry_max":0,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":4,"step_type":"brain_update","name":"Save brand kit","config":{"full_output_key":"brand_kit","signals":["brand_kit_defined"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":5,"step_type":"finalize","name":"Complete","config":{},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0}
 ]'::jsonb,
 '{}'::jsonb,
 true)

ON CONFLICT (template_code) DO NOTHING;
