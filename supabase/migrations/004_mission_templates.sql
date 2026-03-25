-- Migration 004: Seed core mission templates (Core Flow F0 + key missions)

INSERT INTO mission_templates (
  template_code, name, description, type,
  phase_min, phase_max,
  credit_cost_allowance, credit_cost_premium,
  estimated_minutes, cooldown_hours,
  steps_json, params_schema, active
) VALUES

-- ── Core Flow F0 (mandatory, in order) ──────────────────────────────────────

('VISION_PURPOSE_MOODBOARD_V1',
 'Visión y Propósito',
 'Define tu visión creativa, propósito y moodboard de referentes',
 'discovery',
 'F0', 'F7',
 5, 0, 10, 336,
 '[
   {"step_number":1,"step_type":"brain_read","name":"Read context","config":{"facts":["niche_raw","primary_goal","on_camera_comfort"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":2,"step_type":"llm_text","name":"Generate vision","config":{"prompt_key":"VISION_PURPOSE_V1","model":"haiku"},"timeout_seconds":30,"retry_max":2,"skip_on_failure":false,"requires_credit":true,"credit_type":"allowance","credit_amount":5},
   {"step_number":3,"step_type":"user_input","name":"Approve vision","config":{"fields":["vision_statement","creative_purpose","referents"]},"timeout_seconds":259200,"retry_max":0,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":4,"step_type":"brain_update","name":"Save vision","config":{"facts":["vision_statement","creative_purpose"],"signals":["vision_defined"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":5,"step_type":"finalize","name":"Complete","config":{},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0}
 ]'::jsonb,
 '{}'::jsonb,
 true),

('NICHE_CONFIRM_V1',
 'Confirmar Nicho',
 'Valida y refina tu nicho con ayuda de IA basado en tus respuestas de onboarding',
 'discovery',
 'F0', 'F7',
 5, 0, 8, 336,
 '[
   {"step_number":1,"step_type":"brain_read","name":"Read niche data","config":{"facts":["niche_raw","primary_goal","main_blocker","current_platforms"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":2,"step_type":"llm_text","name":"Refine niche","config":{"prompt_key":"NICHE_CONFIRM_V1","model":"haiku"},"timeout_seconds":30,"retry_max":2,"skip_on_failure":false,"requires_credit":true,"credit_type":"allowance","credit_amount":5},
   {"step_number":3,"step_type":"user_input","name":"Confirm niche","config":{"fields":["niche_confirmed","audience_persona","positioning_statement"]},"timeout_seconds":259200,"retry_max":0,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":4,"step_type":"brain_update","name":"Save niche","config":{"facts":["niche","audience_persona","positioning"],"signals":["niche_confirmed"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":5,"step_type":"finalize","name":"Complete","config":{},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0}
 ]'::jsonb,
 '{}'::jsonb,
 true),

('PLATFORM_STRATEGY_PICKER_V1',
 'Estrategia de Plataforma',
 'Define tu plataforma foco y estrategia de publicación basada en tu perfil',
 'planning',
 'F0', 'F7',
 5, 0, 8, 336,
 '[
   {"step_number":1,"step_type":"brain_read","name":"Read platform data","config":{"facts":["niche_raw","current_platforms","hours_per_week","on_camera_comfort"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":2,"step_type":"llm_text","name":"Platform recommendation","config":{"prompt_key":"PLATFORM_STRATEGY_V1","model":"haiku"},"timeout_seconds":30,"retry_max":2,"skip_on_failure":false,"requires_credit":true,"credit_type":"allowance","credit_amount":5},
   {"step_number":3,"step_type":"user_input","name":"Confirm platform","config":{"fields":["focus_platform","focus_platform_handle","posting_frequency"]},"timeout_seconds":259200,"retry_max":0,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":4,"step_type":"brain_update","name":"Save platform","config":{"facts":["focus_platform","focus_platform_handle","posting_frequency"],"signals":["platform_selected"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":5,"step_type":"finalize","name":"Complete","config":{},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0}
 ]'::jsonb,
 '{}'::jsonb,
 true),

('PREFERENCES_CAPTURE_V1',
 'Preferencias Creativas',
 'Captura tus preferencias de contenido: formatos, horarios, estilo de trabajo',
 'discovery',
 'F0', 'F7',
 5, 0, 8, 336,
 '[
   {"step_number":1,"step_type":"brain_read","name":"Read preferences","config":{"facts":["on_camera_comfort","hours_per_week","focus_platform"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":2,"step_type":"llm_text","name":"Generate preferences plan","config":{"prompt_key":"PREFERENCES_CAPTURE_V1","model":"haiku"},"timeout_seconds":30,"retry_max":2,"skip_on_failure":false,"requires_credit":true,"credit_type":"allowance","credit_amount":5},
   {"step_number":3,"step_type":"user_input","name":"Confirm preferences","config":{"fields":["content_formats","best_posting_times","energy_level","collaboration_style"]},"timeout_seconds":259200,"retry_max":0,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":4,"step_type":"brain_update","name":"Save preferences","config":{"facts":["content_formats","best_posting_times"],"signals":["preferences_set"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":5,"step_type":"finalize","name":"Complete","config":{},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0}
 ]'::jsonb,
 '{}'::jsonb,
 true),

-- ── Key missions (post Core Flow) ────────────────────────────────────────────

('CONTENT_BATCH_3D_V1',
 'Batch de Contenido 3 días',
 'Genera scripts y calendario para los próximos 3 días',
 'execution',
 'F0', 'F7',
 80, 50, 20, 72,
 '[
   {"step_number":1,"step_type":"brain_read","name":"Read brain","config":{"facts":["niche","focus_platform","audience_persona","brand_kit"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":2,"step_type":"llm_text","name":"Generate batch","config":{"prompt_key":"CONTENT_BATCH_3D_V1","model":"sonnet"},"timeout_seconds":60,"retry_max":2,"skip_on_failure":false,"requires_credit":true,"credit_type":"allowance","credit_amount":80},
   {"step_number":3,"step_type":"write_outputs","name":"Save content","config":{},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":4,"step_type":"user_input","name":"Approve batch","config":{"fields":["approved_items"]},"timeout_seconds":259200,"retry_max":0,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":5,"step_type":"finalize","name":"Complete","config":{},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0}
 ]'::jsonb,
 '{}'::jsonb,
 true),

('ENGAGEMENT_RESCUE_V1',
 'Rescate de Engagement',
 'Plan de acción para recuperar engagement en caída',
 'rescue',
 'F1', 'F7',
 35, 0, 15, 72,
 '[
   {"step_number":1,"step_type":"brain_read","name":"Read signals","config":{"facts":["avg_engagement_rate","followers_total"],"signals_hours":720},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":2,"step_type":"llm_text","name":"Rescue plan","config":{"prompt_key":"ENGAGEMENT_RESCUE_V1","model":"haiku"},"timeout_seconds":30,"retry_max":2,"skip_on_failure":false,"requires_credit":true,"credit_type":"allowance","credit_amount":35},
   {"step_number":3,"step_type":"user_input","name":"Review plan","config":{"fields":["accepted_actions"]},"timeout_seconds":259200,"retry_max":0,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":4,"step_type":"brain_update","name":"Signal rescue","config":{"signals":["rescue_started"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":5,"step_type":"finalize","name":"Complete","config":{},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0}
 ]'::jsonb,
 '{}'::jsonb,
 true),

('DEFINE_OFFER_V1',
 'Define tu Oferta',
 'Crea tu propuesta de valor y oferta monetizable',
 'planning',
 'F3', 'F7',
 40, 0, 20, 336,
 '[
   {"step_number":1,"step_type":"brain_read","name":"Read context","config":{"facts":["niche","audience_persona","positioning","followers_total"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":2,"step_type":"llm_text","name":"Generate offer","config":{"prompt_key":"DEFINE_OFFER_V1","model":"sonnet"},"timeout_seconds":60,"retry_max":2,"skip_on_failure":false,"requires_credit":true,"credit_type":"allowance","credit_amount":40},
   {"step_number":3,"step_type":"user_input","name":"Confirm offer","config":{"fields":["offer_title","offer_price","offer_audience","offer_cta"]},"timeout_seconds":259200,"retry_max":0,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":4,"step_type":"brain_update","name":"Save offer","config":{"facts":["offer_defined","offer_details"],"signals":["offer_created"]},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0},
   {"step_number":5,"step_type":"finalize","name":"Complete","config":{},"timeout_seconds":10,"retry_max":1,"skip_on_failure":false,"requires_credit":false,"credit_type":null,"credit_amount":0}
 ]'::jsonb,
 '{}'::jsonb,
 true)

ON CONFLICT (template_code) DO NOTHING;
