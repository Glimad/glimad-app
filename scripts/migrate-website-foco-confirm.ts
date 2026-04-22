/**
 * Migration: Add WEBSITE_FOCO_CONFIRM_V1 mission template to DB.
 * Mirrors supabase/migrations/031_website_foco_confirm_template.sql so the
 * template lands in whichever Supabase project the app is pointed at.
 *
 * Run once: npx tsx --env-file=.env.local scripts/migrate-website-foco-confirm.ts
 */
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const TEMPLATE = {
  template_code: 'WEBSITE_FOCO_CONFIRM_V1',
  name: 'Confirmar Plataforma y Nicho (desde sitio web)',
  description:
    'Confirma la plataforma foco y el nicho sugerido a partir del análisis de tu sitio web',
  type: 'discovery',
  active: true,
  phase_min: 'F0',
  phase_max: 'F7',
  credit_cost_allowance: 0,
  credit_cost_premium: 0,
  estimated_minutes: 6,
  cooldown_hours: 336,
  steps_json: [
    {
      step_number: 1,
      step_type: 'brain_read',
      name: 'Read website inference',
      config: {
        facts: [
          'website.url',
          'website.inference',
          'website.scrape',
          'identity.project_type',
          'identity.vision',
          'identity.niche',
          'platforms.all',
        ],
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
      step_type: 'user_input',
      name: 'Confirm FOCO and niche',
      config: {
        fields: ['platforms.focus', 'platforms.satellites', 'identity.niche'],
        user_prompt:
          'Confirma tu plataforma foco y nicho basado en el análisis de tu sitio web.',
      },
      timeout_seconds: 259200,
      retry_max: 0,
      skip_on_failure: false,
      requires_credit: false,
      credit_type: null,
      credit_amount: 0,
    },
    {
      step_number: 3,
      step_type: 'brain_update',
      name: 'Write canonical facts',
      config: {
        facts: ['platforms.focus', 'platforms.satellites', 'identity.niche'],
        signals: ['platform_selected', 'niche_confirmed', 'foco_confirmed_from_website'],
      },
      timeout_seconds: 10,
      retry_max: 1,
      skip_on_failure: false,
      requires_credit: false,
      credit_type: null,
      credit_amount: 0,
    },
    {
      step_number: 4,
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
}

async function main() {
  console.log('Upserting WEBSITE_FOCO_CONFIRM_V1…')
  const { error } = await admin
    .from('mission_templates')
    .upsert(TEMPLATE, { onConflict: 'template_code' })

  if (error) {
    console.error('Failed:', error.message)
    process.exit(1)
  }

  const { data, error: readErr } = await admin
    .from('mission_templates')
    .select('template_code, active, phase_min, phase_max, estimated_minutes')
    .eq('template_code', 'WEBSITE_FOCO_CONFIRM_V1')
    .single()

  if (readErr) {
    console.error('Verification read failed:', readErr.message)
    process.exit(1)
  }

  console.log('✓ Inserted:', data)
}

main()
