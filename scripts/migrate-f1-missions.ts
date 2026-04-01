/**
 * Migration: Add F1 mission templates to DB
 * Run once: npx tsx --env-file=.env scripts/migrate-f1-missions.ts
 */
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const F1_TEMPLATES = [
  {
    template_code: 'AUDIENCE_PERSONA_V1',
    name: 'Define Your Ideal Audience',
    description: 'AI builds a detailed audience persona for your niche — demographics, pain points, language, and best times to reach them.',
    type: 'discovery',
    active: true,
    phase_min: 'F1',
    phase_max: 'F7',
    priority_class: 1,
    estimated_minutes: 12,
    xp_reward: 75,
    credit_cost_allowance: 12,
    credit_cost_premium: 0,
    cooldown_hours: 1440, // 60 days
    steps_json: [
      {
        step_number: 1,
        step_type: 'brain_read',
        name: 'Load creator context',
        config: {
          facts: ['niche_raw', 'niche', 'primary_goal', 'on_camera_comfort', 'focus_platform', 'audience_persona', 'hours_per_week'],
          signals_hours: 72,
        },
        timeout_seconds: 10,
        retry_max: 0,
        skip_on_failure: false,
        requires_credit: false,
        credit_type: null,
        credit_amount: 0,
      },
      {
        step_number: 2,
        step_type: 'llm_text',
        name: 'Generate audience persona',
        config: {
          prompt_key: 'AUDIENCE_PERSONA_V1',
          model: 'sonnet',
        },
        timeout_seconds: 60,
        retry_max: 2,
        skip_on_failure: false,
        requires_credit: true,
        credit_type: 'allowance',
        credit_amount: 12,
      },
      {
        step_number: 3,
        step_type: 'user_input',
        name: 'Review and confirm persona',
        config: {
          fields: ['persona_name'],
        },
        timeout_seconds: 3600,
        retry_max: 0,
        skip_on_failure: false,
        requires_credit: false,
        credit_type: null,
        credit_amount: 0,
      },
      {
        step_number: 4,
        step_type: 'brain_update',
        name: 'Save audience persona to Brain',
        config: {
          full_output_key: 'audience_persona',
          facts: ['persona_name'],
          signals: ['audience_persona_defined'],
        },
        timeout_seconds: 10,
        retry_max: 0,
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
        timeout_seconds: 5,
        retry_max: 0,
        skip_on_failure: false,
        requires_credit: false,
        credit_type: null,
        credit_amount: 0,
      },
    ],
  },
  {
    template_code: 'BATCH_CONFIG_V1',
    name: 'Set Your Content Rhythm',
    description: 'Defines your optimal posting frequency, batch size, and creation schedule based on your available time and platform.',
    type: 'planning',
    active: true,
    phase_min: 'F1',
    phase_max: 'F7',
    priority_class: 1,
    estimated_minutes: 8,
    xp_reward: 50,
    credit_cost_allowance: 4,
    credit_cost_premium: 0,
    cooldown_hours: 720, // 30 days
    steps_json: [
      {
        step_number: 1,
        step_type: 'brain_read',
        name: 'Load creator context',
        config: {
          facts: ['focus_platform', 'hours_per_week', 'audience_persona', 'niche_raw', 'niche', 'batch_config'],
        },
        timeout_seconds: 10,
        retry_max: 0,
        skip_on_failure: false,
        requires_credit: false,
        credit_type: null,
        credit_amount: 0,
      },
      {
        step_number: 2,
        step_type: 'llm_text',
        name: 'Generate content schedule',
        config: {
          prompt_key: 'BATCH_CONFIG_V1',
          model: 'haiku',
        },
        timeout_seconds: 30,
        retry_max: 2,
        skip_on_failure: false,
        requires_credit: true,
        credit_type: 'allowance',
        credit_amount: 4,
      },
      {
        step_number: 3,
        step_type: 'user_input',
        name: 'Confirm your schedule',
        config: {
          fields: ['posts_per_week'],
        },
        timeout_seconds: 3600,
        retry_max: 0,
        skip_on_failure: false,
        requires_credit: false,
        credit_type: null,
        credit_amount: 0,
      },
      {
        step_number: 4,
        step_type: 'brain_update',
        name: 'Save batch config to Brain',
        config: {
          full_output_key: 'batch_config',
          facts: ['posts_per_week', 'posting_frequency'],
          signals: ['batch_config_set'],
        },
        timeout_seconds: 10,
        retry_max: 0,
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
        timeout_seconds: 5,
        retry_max: 0,
        skip_on_failure: false,
        requires_credit: false,
        credit_type: null,
        credit_amount: 0,
      },
    ],
  },
  {
    template_code: 'BRAND_KIT_LITE_V1',
    name: 'Build Your Brand Kit',
    description: 'Creates your tone of voice, visual style, content pillars, and hashtag strategy — the foundation for consistent content.',
    type: 'planning',
    active: true,
    phase_min: 'F1',
    phase_max: 'F7',
    priority_class: 3,
    estimated_minutes: 10,
    xp_reward: 60,
    credit_cost_allowance: 5,
    credit_cost_premium: 0,
    cooldown_hours: 1440, // 60 days
    steps_json: [
      {
        step_number: 1,
        step_type: 'brain_read',
        name: 'Load creator context',
        config: {
          facts: ['niche_raw', 'niche', 'focus_platform', 'audience_persona', 'vision_statement', 'brand_kit'],
        },
        timeout_seconds: 10,
        retry_max: 0,
        skip_on_failure: false,
        requires_credit: false,
        credit_type: null,
        credit_amount: 0,
      },
      {
        step_number: 2,
        step_type: 'llm_text',
        name: 'Generate brand kit',
        config: {
          prompt_key: 'BRAND_KIT_LITE_V1',
          model: 'sonnet',
        },
        timeout_seconds: 60,
        retry_max: 2,
        skip_on_failure: false,
        requires_credit: true,
        credit_type: 'allowance',
        credit_amount: 5,
      },
      {
        step_number: 3,
        step_type: 'user_input',
        name: 'Review and approve brand kit',
        config: {
          fields: ['brand_name', 'tone_of_voice'],
        },
        timeout_seconds: 3600,
        retry_max: 0,
        skip_on_failure: false,
        requires_credit: false,
        credit_type: null,
        credit_amount: 0,
      },
      {
        step_number: 4,
        step_type: 'brain_update',
        name: 'Save brand kit to Brain',
        config: {
          full_output_key: 'brand_kit',
          facts: ['brand_name'],
          signals: ['brand_kit_defined'],
        },
        timeout_seconds: 10,
        retry_max: 0,
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
        timeout_seconds: 5,
        retry_max: 0,
        skip_on_failure: false,
        requires_credit: false,
        credit_type: null,
        credit_amount: 0,
      },
    ],
  },
]

async function main() {
  console.log('Inserting F1 mission templates...')
  for (const tmpl of F1_TEMPLATES) {
    const { error } = await admin
      .from('mission_templates')
      .upsert(tmpl, { onConflict: 'template_code' })
    if (error) {
      console.error(`Failed to insert ${tmpl.template_code}:`, error.message)
    } else {
      console.log(`✓ ${tmpl.template_code}`)
    }
  }

  const { data } = await admin
    .from('mission_templates')
    .select('template_code, active, phase_min, priority_class')
    .eq('active', true)
    .order('priority_class')

  console.log('\nAll active templates:')
  data?.forEach(t => console.log(' ', t.priority_class, t.template_code, t.phase_min))
}

main()
