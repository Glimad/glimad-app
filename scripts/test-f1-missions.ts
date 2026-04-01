/**
 * E2E test for F1 missions: AUDIENCE_PERSONA_V1, BATCH_CONFIG_V1, BRAND_KIT_LITE_V1
 * Run: npx tsx --env-file=.env scripts/test-f1-missions.ts
 */
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '../lib/supabase/admin'
import { createMissionInstance, executeMission, resumeMissionAfterInput } from '../lib/missions/runner'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function newClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

let passed = 0
let failed = 0

function ok(label: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.log(`  ✗ ${label}${detail ? ` [${detail}]` : ''}`)
    failed++
  }
}

async function main() {
  console.log('=== F1 Mission Templates E2E ===\n')
  console.log('NOTE: Each mission calls Claude API — takes 10-30s each\n')

  // Setup — use admin API to bypass email verification
  const TEST_EMAIL = `e2e-f1-${Date.now()}@glimad-test.dev`
  const admin = createAdminClient()

  const { data: created } = await admin.auth.admin.createUser({
    email: TEST_EMAIL, password: 'TestPass123!', email_confirm: true,
  })
  const userId = created.user!.id

  // Project is auto-created by DB trigger — just update it to F1
  const { data: project } = await admin
    .from('projects')
    .update({ status: 'active', phase_code: 'F1', focus_platform: 'instagram' })
    .eq('user_id', userId)
    .select('id')
    .single()
  const projectId = project!.id

  console.log(`Test project: ${projectId}\n`)

  // Seed wallet
  await admin.from('core_wallets').upsert({
    project_id: projectId, plan_code: 'PRO',
    allowance_llm_balance: 5000, credits_allowance: 5000,
    premium_credits_balance: 1250, premium_daily_cap_remaining: 1250,
    allowance_reset_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    premium_reset_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    status: 'active',
  }, { onConflict: 'project_id' })

  // Seed brain facts
  await admin.from('brain_facts').upsert([
    { project_id: projectId, fact_key: 'niche_raw', value: 'personal finance for remote workers', source: 'onboarding', updated_at: new Date().toISOString() },
    { project_id: projectId, fact_key: 'focus_platform', value: 'instagram', source: 'onboarding', updated_at: new Date().toISOString() },
    { project_id: projectId, fact_key: 'hours_per_week', value: '3-5', source: 'onboarding', updated_at: new Date().toISOString() },
    { project_id: projectId, fact_key: 'primary_goal', value: 'grow to 5K followers in 3 months', source: 'onboarding', updated_at: new Date().toISOString() },
  ], { onConflict: 'project_id,fact_key' })

  // ── [1] AUDIENCE_PERSONA_V1 ──────────────────────────────────────────────
  console.log('[1] AUDIENCE_PERSONA_V1 — generates persona, confirms, completes')
  {
    const instanceId = await createMissionInstance(admin, projectId, 'AUDIENCE_PERSONA_V1')
    await executeMission(admin, instanceId)

    const { data: inst } = await admin.from('mission_instances').select('status').eq('id', instanceId).single()
    ok('status = waiting_input after first run', inst?.status === 'waiting_input', `got: ${inst?.status}`)

    const { data: steps } = await admin.from('mission_steps').select('step_number, step_type, status').eq('mission_instance_id', instanceId)
    ok('brain_read completed', steps?.find(s => s.step_type === 'brain_read')?.status === 'completed')
    ok('llm_text completed', steps?.find(s => s.step_type === 'llm_text')?.status === 'completed')

    const { data: llmStep } = await admin.from('mission_steps').select('output').eq('mission_instance_id', instanceId).eq('step_type', 'llm_text').single()
    const llmOut = llmStep?.output as Record<string, unknown>
    ok('LLM output has persona_name', !!llmOut?.persona_name, `keys: ${Object.keys(llmOut ?? {}).join(', ')}`)
    ok('LLM output has demographics', !!llmOut?.demographics)
    ok('LLM output has pain_points', Array.isArray(llmOut?.pain_points))

    await resumeMissionAfterInput(admin, instanceId, { persona_name: String(llmOut?.persona_name ?? 'Test Persona') })
    const { data: completed } = await admin.from('mission_instances').select('status').eq('id', instanceId).single()
    ok('status = completed after resume', completed?.status === 'completed', `got: ${completed?.status}`)

    const { data: fact } = await admin.from('brain_facts').select('value').eq('project_id', projectId).eq('fact_key', 'audience_persona').single()
    ok('audience_persona fact saved', !!fact?.value)
  }

  // ── [2] BATCH_CONFIG_V1 ──────────────────────────────────────────────────
  console.log('\n[2] BATCH_CONFIG_V1 — generates posting schedule, confirms, completes')
  {
    const instanceId = await createMissionInstance(admin, projectId, 'BATCH_CONFIG_V1')
    await executeMission(admin, instanceId)

    const { data: inst } = await admin.from('mission_instances').select('status').eq('id', instanceId).single()
    ok('status = waiting_input', inst?.status === 'waiting_input', `got: ${inst?.status}`)

    const { data: llmStep } = await admin.from('mission_steps').select('output').eq('mission_instance_id', instanceId).eq('step_type', 'llm_text').single()
    const llmOut = llmStep?.output as Record<string, unknown>
    ok('LLM output has posts_per_week', llmOut?.posts_per_week !== undefined, `keys: ${Object.keys(llmOut ?? {}).join(', ')}`)
    ok('LLM output has best_posting_times', Array.isArray(llmOut?.best_posting_times))

    await resumeMissionAfterInput(admin, instanceId, { posts_per_week: String(llmOut?.posts_per_week ?? '3') })
    const { data: completed } = await admin.from('mission_instances').select('status').eq('id', instanceId).single()
    ok('status = completed', completed?.status === 'completed', `got: ${completed?.status}`)

    const { data: fact } = await admin.from('brain_facts').select('value').eq('project_id', projectId).eq('fact_key', 'batch_config').single()
    ok('batch_config fact saved', !!fact?.value)
  }

  // ── [3] BRAND_KIT_LITE_V1 ───────────────────────────────────────────────
  console.log('\n[3] BRAND_KIT_LITE_V1 — generates brand kit, confirms, completes')
  {
    const instanceId = await createMissionInstance(admin, projectId, 'BRAND_KIT_LITE_V1')
    await executeMission(admin, instanceId)

    const { data: inst } = await admin.from('mission_instances').select('status').eq('id', instanceId).single()
    ok('status = waiting_input', inst?.status === 'waiting_input', `got: ${inst?.status}`)

    const { data: llmStep } = await admin.from('mission_steps').select('output').eq('mission_instance_id', instanceId).eq('step_type', 'llm_text').single()
    const llmOut = llmStep?.output as Record<string, unknown>
    ok('LLM output has tone_of_voice', !!llmOut?.tone_of_voice, `keys: ${Object.keys(llmOut ?? {}).join(', ')}`)
    ok('LLM output has content_pillars', Array.isArray(llmOut?.content_pillars))
    ok('LLM output has hashtag_strategy', !!llmOut?.hashtag_strategy)

    await resumeMissionAfterInput(admin, instanceId, {
      brand_name: String(llmOut?.brand_name ?? 'TestBrand'),
      tone_of_voice: String(llmOut?.tone_of_voice ?? 'casual'),
    })
    const { data: completed } = await admin.from('mission_instances').select('status').eq('id', instanceId).single()
    ok('status = completed', completed?.status === 'completed', `got: ${completed?.status}`)

    const { data: fact } = await admin.from('brain_facts').select('value').eq('project_id', projectId).eq('fact_key', 'brand_kit').single()
    ok('brand_kit fact saved', !!fact?.value)
  }

  console.log(`\n=== ${passed + failed} assertions: ${passed} passed, ${failed} failed ===`)
}

main().catch(err => {
  console.error('Test suite error:', err)
  process.exit(1)
})
