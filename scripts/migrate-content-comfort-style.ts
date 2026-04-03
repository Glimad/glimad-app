/**
 * Migration: Add CONTENT_COMFORT_STYLE_V1 mission template (2nd Core Flow mission)
 * Run: npx tsx --env-file=.env scripts/migrate-content-comfort-style.ts
 */
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function main() {
  console.log('Inserting CONTENT_COMFORT_STYLE_V1 mission template...')

  const { error } = await admin.from('mission_templates').upsert({
    template_code: 'CONTENT_COMFORT_STYLE_V1',
    name: 'Estilo y Límites de Contenido',
    description: 'Define tu zona de confort creativa: tono de marca, estilo visual y límites de contenido',
    type: 'discovery',
    active: true,
    phase_min: 'F0',
    phase_max: 'F7',
    priority_class: 1,
    estimated_minutes: 8,
    credit_cost_allowance: 5,
    credit_cost_premium: 0,
    cooldown_hours: 336,
    steps_json: [
      {
        step_number: 1,
        step_type: 'brain_read',
        name: 'Read context',
        config: {
          facts: ['niche_raw', 'primary_goal', 'on_camera_comfort', 'vision_statement', 'creative_purpose'],
        },
        timeout_seconds: 10,
        retry_max: 1,
        skip_on_failure: false,
        requires_credit: false,
        credit_type: null,
        credit_amount: 0,
      },
      {
        step_number: 2,
        step_type: 'llm_text',
        name: 'Generate style profile',
        config: {
          prompt_key: 'CONTENT_COMFORT_STYLE_V1',
          model: 'haiku',
        },
        timeout_seconds: 30,
        retry_max: 2,
        skip_on_failure: false,
        requires_credit: true,
        credit_type: 'allowance',
        credit_amount: 5,
      },
      {
        step_number: 3,
        step_type: 'user_input',
        name: 'Confirm style',
        config: {
          fields: ['brand_tone', 'content_style', 'face_visibility_confirmed'],
        },
        timeout_seconds: 259200,
        retry_max: 0,
        skip_on_failure: false,
        requires_credit: false,
        credit_type: null,
        credit_amount: 0,
      },
      {
        step_number: 4,
        step_type: 'brain_update',
        name: 'Save style',
        config: {
          facts: ['brand_tone', 'content_style', 'face_visibility_confirmed'],
          signals: ['content_style_defined'],
        },
        timeout_seconds: 10,
        retry_max: 1,
        skip_on_failure: false,
        requires_credit: false,
        credit_type: null,
        credit_amount: 0,
      },
      {
        step_number: 5,
        step_type: 'finalize',
        name: 'Complete',
        config: {},
        timeout_seconds: 10,
        retry_max: 1,
        skip_on_failure: false,
        requires_credit: false,
        credit_type: null,
        credit_amount: 0,
      },
    ],
    params_schema: {},
  }, { onConflict: 'template_code' })

  if (error) {
    console.error('Failed:', error.message)
    process.exit(1)
  }

  console.log('✓ CONTENT_COMFORT_STYLE_V1 inserted')

  const { data } = await admin
    .from('mission_templates')
    .select('template_code, active, phase_min, priority_class')
    .eq('active', true)
    .order('priority_class')

  console.log('\nAll active templates:')
  data?.forEach(t => console.log(' ', t.priority_class, t.template_code, t.phase_min))
}

main()
