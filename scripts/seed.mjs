/**
 * Glimad — Full Test Seed
 * Run: node scripts/seed.mjs
 *
 * Creates 3 test users covering every phase/mode/plan combination:
 *   alice@test.glimad.com  — F3, monetize, PRO
 *   bob@test.glimad.com    — F0, test, BASE (just started)
 *   carol@test.glimad.com  — F5, scale, ELITE (power user)
 *
 * Seeds every table in dependency order. Safe to re-run (upserts where
 * possible; deletes old seed data first where not).
 */

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// ── Config ────────────────────────────────────────────────────────────────

const SUPABASE_URL       = 'https://awaakurvnngazmnnmwza.supabase.co'
const SERVICE_ROLE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3YWFrdXJ2bm5nYXptbm5td3phIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDg1NDA0MSwiZXhwIjoyMDgwNDMwMDQxfQ.placeholder'

// We need the real service role key from .env
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env')
const envVars = {}
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) envVars[m[1].trim()] = m[2].trim()
}

const SUPA_URL = envVars['NEXT_PUBLIC_SUPABASE_URL']
const SUPA_SR  = envVars['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPA_URL || !SUPA_SR) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const admin = createClient(SUPA_URL, SUPA_SR, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Helpers ───────────────────────────────────────────────────────────────

function uuid() { return crypto.randomUUID() }
function days(n) {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString()
}
function daysDate(n) { return days(n).slice(0, 10) }
function ago(n) { return days(-n) }
function agoDate(n) { return ago(n).slice(0, 10) }

async function upsertUser(email, password, metadata = {}) {
  // Try to find existing user
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 })
  const existing = list?.users?.find(u => u.email === email)
  if (existing) {
    console.log(`  ↳ user exists: ${email} (${existing.id})`)
    return existing
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (error) throw new Error(`createUser(${email}): ${error.message}`)
  console.log(`  ↳ created user: ${email} (${data.user.id})`)
  return data.user
}

async function ins(table, rows, { onConflict } = {}) {
  const arr = Array.isArray(rows) ? rows : [rows]
  if (!arr.length) return []
  const q = admin.from(table).insert(arr)
  const { data, error } = await q.select()
  if (error) {
    // Ignore duplicate-key violations for idempotency
    if (error.code === '23505') return []
    throw new Error(`insert ${table}: ${error.message} | ${JSON.stringify(arr[0]).slice(0,200)}`)
  }
  return data ?? []
}

async function upsert(table, rows, conflict) {
  const arr = Array.isArray(rows) ? rows : [rows]
  if (!arr.length) return []
  const { data, error } = await admin.from(table).upsert(arr, { onConflict: conflict }).select()
  if (error) throw new Error(`upsert ${table}: ${error.message}`)
  return data ?? []
}

function log(msg) { console.log(`\n▸ ${msg}`) }

// ── Seed data builders ────────────────────────────────────────────────────

function buildFacts(projectId, facts) {
  return Object.entries(facts)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([fact_key, value]) => ({
      project_id: projectId,
      fact_key,
      value,
      source: 'seed',
      updated_at: new Date().toISOString(),
    }))
}

function buildSignal(projectId, signal_key, value, source = 'seed', offsetDays = 0) {
  return {
    project_id: projectId,
    signal_key,
    value,
    source,
    observed_at: ago(offsetDays),
  }
}

function buildMissionInstance(projectId, templateCode, status, completedAgo = null) {
  const id = uuid()
  return {
    id,
    project_id: projectId,
    template_code: templateCode,
    status,
    unique_key: `${projectId}:${templateCode}:${completedAgo ?? daysDate(0)}`,
    current_step: status === 'completed' ? 5 : status === 'needs_user_input' ? 3 : 0,
    started_at: status !== 'queued' ? ago(completedAgo ?? 1) : null,
    completed_at: status === 'completed' ? ago(completedAgo ?? 0) : null,
    executor_type: 'guided_llm',
    handoff_channel: 'in_app',
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Glimad seed starting...\n')

  // ── 1. Auth users ──────────────────────────────────────────────────────
  log('1. Creating auth users')
  const alice = await upsertUser('alice@test.glimad.com', 'Seedpass123!', { locale: 'en' })
  const bob   = await upsertUser('bob@test.glimad.com',   'Seedpass123!', { locale: 'en' })
  const carol = await upsertUser('carol@test.glimad.com', 'Seedpass123!', { locale: 'es' })

  // ── 2. Onboarding sessions ─────────────────────────────────────────────
  log('2. Onboarding sessions')
  // Delete old seed sessions first
  await admin.from('onboarding_sessions').delete().eq('converted_to_user_id', alice.id)
  await admin.from('onboarding_sessions').delete().eq('converted_to_user_id', bob.id)
  await admin.from('onboarding_sessions').delete().eq('converted_to_user_id', carol.id)

  const [aliceSession] = await ins('onboarding_sessions', {
    id: uuid(),
    converted_to_user_id: alice.id,
    experiment_variant: 'B_has_presence',
    status: 'completed',
    step_current: 6,
    step_total: 6,
    responses_json: {
      niche: 'Personal finance for millennials',
      goal_90d: 'Reach 20k followers and launch first digital product',
      main_blocker: 'Not enough time to create consistent content',
      on_camera_comfort: true,
      hours_per_week: 10,
      platforms: ['instagram'],
    },
    completed_at: ago(30),
    started_at: ago(31),
  })

  const [bobSession] = await ins('onboarding_sessions', {
    id: uuid(),
    converted_to_user_id: bob.id,
    experiment_variant: 'A_zero_start',
    status: 'completed',
    step_current: 6,
    step_total: 6,
    responses_json: {
      niche: 'Productivity and minimalism',
      goal_90d: 'Start posting consistently and build an audience from zero',
      main_blocker: "I don't know where to start",
      on_camera_comfort: false,
      hours_per_week: 5,
      platforms: [],
    },
    completed_at: ago(3),
    started_at: ago(3),
  })

  const [carolSession] = await ins('onboarding_sessions', {
    id: uuid(),
    converted_to_user_id: carol.id,
    experiment_variant: 'B_has_presence',
    status: 'completed',
    step_current: 6,
    step_total: 6,
    responses_json: {
      niche: 'Fitness and healthy lifestyle',
      goal_90d: 'Scale to 100k subscribers and launch online coaching program',
      main_blocker: 'Hard to repurpose content across platforms efficiently',
      on_camera_comfort: true,
      hours_per_week: 20,
      platforms: ['youtube', 'instagram'],
    },
    completed_at: ago(90),
    started_at: ago(91),
  })

  // ── 3. Projects ────────────────────────────────────────────────────────
  log('3. Projects')

  // Upsert helper: find existing or create. Uses deterministic IDs so re-runs are stable.
  async function upsertProject(userId, data) {
    const { data: existing } = await admin
      .from('projects')
      .select('id')
      .eq('user_id', userId)
      .neq('status', 'archived')
      .limit(1)
      .single()
    if (existing) {
      await admin.from('projects').update(data).eq('id', existing.id)
      console.log(`  ↳ updated project ${existing.id} for ${userId}`)
      return existing.id
    }
    const id = uuid()
    await ins('projects', { id, user_id: userId, ...data })
    console.log(`  ↳ created project ${id} for ${userId}`)
    return id
  }

  const aliceProjId = await upsertProject(alice.id, {
    name: 'Alice Finance Creator',
    status: 'active',
    phase_code: 'F3',
    active_mode: 'monetize',
    publishing_mode: 'LIVE',
    focus_platform: 'instagram',
    focus_platform_handle: '@alicefinance',
    xp: 2200,
    energy: 80,
    streak_days: 18,
    last_active_date: daysDate(0),
  })

  const bobProjId = await upsertProject(bob.id, {
    name: 'Bob Productivity',
    status: 'active',
    phase_code: 'F0',
    active_mode: 'test',
    publishing_mode: 'BUILDING',
    focus_platform: 'instagram',
    focus_platform_handle: '@bobminimalist',
    xp: 50,
    energy: 100,
    streak_days: 1,
    last_active_date: daysDate(0),
  })

  const carolProjId = await upsertProject(carol.id, {
    name: 'Carol Fitness',
    status: 'active',
    phase_code: 'F5',
    active_mode: 'scale',
    publishing_mode: 'LIVE',
    focus_platform: 'youtube',
    focus_platform_handle: '@carolfit',
    xp: 8500,
    energy: 65,
    streak_days: 35,
    last_active_date: daysDate(0),
  })

  // ── 4. User preferences ─────────────────────────────────────────────────
  log('4. User preferences')
  await upsert('user_preferences', [
    { project_id: aliceProjId, face_visibility: 'yes',   tone: 'friendly and educational', availability_hours_week: 10, posting_frequency: '4x/week', timezone: 'Europe/Madrid', locale: 'en' },
    { project_id: bobProjId,   face_visibility: 'no',    tone: 'calm and minimalist',       availability_hours_week: 5,  posting_frequency: '2x/week', timezone: 'Europe/Madrid', locale: 'en' },
    { project_id: carolProjId, face_visibility: 'yes',   tone: 'energetic and motivational', availability_hours_week: 20, posting_frequency: '5x/week', timezone: 'America/Mexico_City', locale: 'es' },
  ], 'project_id')

  // ── 5. Projects platforms ───────────────────────────────────────────────
  log('5. Projects platforms')
  await upsert('projects_platforms', [
    // Alice — Instagram focus
    { project_id: aliceProjId, platform: 'instagram', handle: '@alicefinance',   role: 'focus',     connected: true },
    { project_id: aliceProjId, platform: 'tiktok',    handle: '@alicefinance',   role: 'satellite', connected: false },
    // Bob — Instagram focus (not yet connected)
    { project_id: bobProjId,   platform: 'instagram', handle: '@bobminimalist',  role: 'focus',     connected: false },
    // Carol — YouTube focus + Instagram satellite
    { project_id: carolProjId, platform: 'youtube',   handle: '@carolfit',       role: 'focus',     connected: true },
    { project_id: carolProjId, platform: 'instagram', handle: '@carolfit',       role: 'satellite', connected: true },
    { project_id: carolProjId, platform: 'tiktok',    handle: '@carolfit',       role: 'observe',   connected: false },
  ], 'project_id,platform')

  // ── 6. Core plans (ensure seeded) ──────────────────────────────────────
  log('6. Core plans')
  await upsert('core_plans', [
    { plan_code: 'BASE',  name: 'Base',  price_monthly_eur: 29,  allowance_llm_monthly: 2000, premium_credits_monthly: 500,  max_projects: 1, daily_llm_limit: 50,  active: true },
    { plan_code: 'PRO',   name: 'Pro',   price_monthly_eur: 59,  allowance_llm_monthly: 5000, premium_credits_monthly: 1500, max_projects: 3, daily_llm_limit: 100, active: true },
    { plan_code: 'ELITE', name: 'Elite', price_monthly_eur: 129, allowance_llm_monthly: 15000, premium_credits_monthly: 5000, max_projects: 10, daily_llm_limit: 250, active: true },
  ], 'plan_code')

  // ── 7. Subscriptions ────────────────────────────────────────────────────
  log('7. Subscriptions')
  const aliceSubId = `sub_seed_alice_${aliceProjId.slice(0,8)}`
  const bobSubId   = `sub_seed_bob_${bobProjId.slice(0,8)}`
  const carolSubId = `sub_seed_carol_${carolProjId.slice(0,8)}`

  await upsert('core_subscriptions', [
    {
      project_id: aliceProjId, user_id: alice.id,
      stripe_customer_id: `cus_seed_alice`, stripe_subscription_id: aliceSubId,
      plan_code: 'PRO', status: 'active',
      current_period_start: ago(5), current_period_end: days(25),
      cancel_at_period_end: false,
    },
    {
      project_id: bobProjId, user_id: bob.id,
      stripe_customer_id: `cus_seed_bob`, stripe_subscription_id: bobSubId,
      plan_code: 'BASE', status: 'active',
      current_period_start: ago(2), current_period_end: days(28),
      cancel_at_period_end: false,
    },
    {
      project_id: carolProjId, user_id: carol.id,
      stripe_customer_id: `cus_seed_carol`, stripe_subscription_id: carolSubId,
      plan_code: 'ELITE', status: 'active',
      current_period_start: ago(10), current_period_end: days(20),
      cancel_at_period_end: false,
    },
  ], 'stripe_subscription_id')

  // ── 8. Wallets ──────────────────────────────────────────────────────────
  log('8. Wallets')
  await upsert('core_wallets', [
    { project_id: aliceProjId, plan_code: 'PRO',   allowance_llm_balance: 4200, credits_allowance: 5000, premium_credits_balance: 1200, premium_daily_cap_remaining: 100, allowance_reset_at: days(25), premium_reset_at: days(25), status: 'active' },
    { project_id: bobProjId,   plan_code: 'BASE',  allowance_llm_balance: 1950, credits_allowance: 2000, premium_credits_balance: 495,  premium_daily_cap_remaining: 50,  allowance_reset_at: days(28), premium_reset_at: days(28), status: 'active' },
    { project_id: carolProjId, plan_code: 'ELITE', allowance_llm_balance: 13500, credits_allowance: 15000, premium_credits_balance: 4600, premium_daily_cap_remaining: 250, allowance_reset_at: days(20), premium_reset_at: days(20), status: 'active' },
  ], 'project_id')

  // ── 9. Access grants ────────────────────────────────────────────────────
  log('9. Access grants')
  await upsert('core_access_grants', [
    { user_id: alice.id, project_id: aliceProjId, source: 'subscription', status: 'active', reference_id: aliceSubId },
    { user_id: bob.id,   project_id: bobProjId,   source: 'subscription', status: 'active', reference_id: bobSubId   },
    { user_id: carol.id, project_id: carolProjId, source: 'subscription', status: 'active', reference_id: carolSubId },
  ], 'reference_id')

  // ── 10. Ledger ──────────────────────────────────────────────────────────
  log('10. Core ledger')
  await ins('core_ledger', [
    // Alice — PRO grant + scrape debits + mission debits
    { project_id: aliceProjId, kind: 'credit',     amount_allowance: 5000, amount_premium: 1500, reason_key: 'PLAN_MONTHLY_GRANT',     idempotency_key: `seed_grant_alice_${aliceProjId}`,    ref_type: 'payment', ref_id: aliceSubId, metadata_json: { plan_code: 'PRO' } },
    { project_id: aliceProjId, kind: 'debit',      amount_allowance: -800, amount_premium: 0,    reason_key: 'MISSION_ALLOWANCE_DEBIT', idempotency_key: `seed_mission_debit_alice_1`,         metadata_json: { template_code: 'VISION_PURPOSE_MOODBOARD_V1' } },
    { project_id: aliceProjId, kind: 'debit',      amount_allowance: 0,    amount_premium: -5,   reason_key: 'SCRAPE_LIGHT_DEBIT',      idempotency_key: `seed_scrape_debit_alice_1`,         metadata_json: { platform: 'instagram' } },
    { project_id: aliceProjId, kind: 'debit',      amount_allowance: 0,    amount_premium: -5,   reason_key: 'SCRAPE_LIGHT_DEBIT',      idempotency_key: `seed_scrape_debit_alice_2`,         metadata_json: { platform: 'instagram' } },
    { project_id: aliceProjId, kind: 'credit',     amount_allowance: 0,    amount_premium: 100,  reason_key: 'MISSION_COMPLETION_REWARD', idempotency_key: `seed_reward_alice_streak14`,      metadata_json: { streak_milestone: 14 } },
    // Bob — BASE grant + 1 mission debit
    { project_id: bobProjId,   kind: 'credit',     amount_allowance: 2000, amount_premium: 500,  reason_key: 'PLAN_MONTHLY_GRANT',     idempotency_key: `seed_grant_bob_${bobProjId}`,        ref_type: 'payment', ref_id: bobSubId,   metadata_json: { plan_code: 'BASE' } },
    { project_id: bobProjId,   kind: 'debit',      amount_allowance: -50,  amount_premium: 0,    reason_key: 'MISSION_ALLOWANCE_DEBIT', idempotency_key: `seed_mission_debit_bob_1`,          metadata_json: { template_code: 'VISION_PURPOSE_MOODBOARD_V1' } },
    // Carol — ELITE grant + heavy usage
    { project_id: carolProjId, kind: 'credit',     amount_allowance: 15000, amount_premium: 5000, reason_key: 'PLAN_MONTHLY_GRANT',    idempotency_key: `seed_grant_carol_${carolProjId}`,    ref_type: 'payment', ref_id: carolSubId, metadata_json: { plan_code: 'ELITE' } },
    { project_id: carolProjId, kind: 'debit',      amount_allowance: -1500, amount_premium: 0,   reason_key: 'MISSION_ALLOWANCE_DEBIT', idempotency_key: `seed_mission_debit_carol_1`,        metadata_json: {} },
    { project_id: carolProjId, kind: 'debit',      amount_allowance: 0,    amount_premium: -200, reason_key: 'SCRAPE_LIGHT_DEBIT',      idempotency_key: `seed_scrape_debit_carol_1`,         metadata_json: { platform: 'youtube' } },
    { project_id: carolProjId, kind: 'debit',      amount_allowance: 0,    amount_premium: -200, reason_key: 'SCRAPE_LIGHT_DEBIT',      idempotency_key: `seed_scrape_debit_carol_2`,         metadata_json: { platform: 'instagram' } },
    { project_id: carolProjId, kind: 'credit',     amount_allowance: 0,    amount_premium: 100,  reason_key: 'MISSION_COMPLETION_REWARD', idempotency_key: `seed_reward_carol_streak14`,      metadata_json: { streak_milestone: 14 } },
    { project_id: carolProjId, kind: 'credit',     amount_allowance: 0,    amount_premium: 0,    reason_key: 'PLAN_MONTHLY_GRANT',     idempotency_key: `seed_reward_carol_streak30`,         metadata_json: { streak_milestone: 30 } },
    { project_id: carolProjId, kind: 'debit',      amount_allowance: -100, amount_premium: 0,    reason_key: 'LLM_CALL_STUDIO',         idempotency_key: `seed_studio_carol_1`,               metadata_json: {} },
  ])

  // ── 11. Brain facts ─────────────────────────────────────────────────────
  log('11. Brain facts')

  // Alice — F3, all facts populated
  await upsert('brain_facts', buildFacts(aliceProjId, {
    'identity.niche':           { niche: 'Personal finance', subniche: 'Investing for millennials', target_audience: 'Women 25-35 building wealth', unique_angle: 'Fun and jargon-free financial education' },
    'identity.primary_goal':    'Reach 20k followers and launch first digital product',
    'identity.main_blocker':    'Not enough time to create consistent content',
    'identity.flow_variant':    'B_has_presence',
    'identity.north_star':      'Democratize financial education for young women in Spain',
    'capabilities.on_camera_comfort': true,
    'capabilities.weekly_hours_available': 10,
    'capabilities.current':     { execution: 72, audienceSignal: 68, clarity: 85, readiness: 60 },
    'platforms.focus':          { platform: 'instagram', handle: '@alicefinance', follower_count: 12400 },
    'platforms.satellites':     [{ platform: 'tiktok', handle: '@alicefinance', status: 'planned' }],
    'followers_total':          12400,
    'current_followers':        12400,
    'avg_engagement_rate':      3.2,
    'posts_last_30d':           16,
    'last_post_date':           agoDate(1),
    'posts_per_week_average':   4,
    'avg_views_last10':         8500,
    'current_phase':            'F3',
    'vision_statement':         'Help 100,000 women take control of their finances through engaging content',
    'creative_purpose':         'Make money less scary and more approachable',
    'brand_tone':               'friendly, educational, empowering',
    'content_style':            'carousels and reels with clear data visuals',
    'face_visibility_confirmed': true,
    'audience_persona':         { name: 'María', age: '28-34', pain_points: ['overwhelmed by financial jargon', 'afraid of investing'], goals: ['build emergency fund', 'start investing', 'buy first home'] },
    'content.pillars':          ['investing basics', 'budgeting tips', 'savings strategies', 'debt payoff'],
    'content.winner_format':    { format: 'carousel', confidence: 0.88, avg_er: 4.1, sample_size: 12 },
    'posting_frequency':        '4x/week',
    'best_posting_times':       ['Tuesday 18:00', 'Thursday 18:00', 'Saturday 10:00', 'Sunday 18:00'],
    'energy_level':             'medium',
    'batch_preference':         'batch_7d',
    'collaboration_style':      'solo',
    'offer_details':            { offer_title: 'Finance Starter Kit', offer_type: 'digital_product', offer_price: 29, offer_audience: 'beginner investors', value_proposition: '5-step roadmap to start investing with €50/month' },
    'offer_defined':            true,
    'last_mission_date':        daysDate(0),
    'streak_freezes_available': 2,
    'streak_milestones_granted': [3, 7, 14],
    'vip_badge':                false,
    'services.preference.channel': 'in_app',
    'services.preference.mode_default': 'guided_llm',
    'services_preference_channel': 'in_app',
    'services_preference_mode_default': 'guided_llm',
  }), 'project_id,fact_key')

  // Bob — F0, only onboarding facts
  await upsert('brain_facts', buildFacts(bobProjId, {
    'identity.niche':           { niche: 'Productivity and minimalism', subniche: 'Digital minimalism', target_audience: 'Overwhelmed professionals', unique_angle: 'Less is more approach to productivity' },
    'identity.primary_goal':    'Start posting consistently and build an audience from zero',
    'identity.main_blocker':    "I don't know where to start",
    'identity.flow_variant':    'A_zero_start',
    'capabilities.on_camera_comfort': false,
    'capabilities.weekly_hours_available': 5,
    'capabilities.current':     { execution: 5, audienceSignal: 0, clarity: 20, readiness: 10 },
    'platforms.focus':          { platform: 'instagram', handle: '@bobminimalist', follower_count: 0 },
    'platforms.satellites':     [],
    'current_phase':            'F0',
    'last_mission_date':        null,
    'streak_freezes_available': 2,
    'streak_milestones_granted': [],
  }), 'project_id,fact_key')

  // Carol — F5, fully developed
  await upsert('brain_facts', buildFacts(carolProjId, {
    'identity.niche':           { niche: 'Fitness', subniche: 'Functional training and nutrition', target_audience: 'Adults 30-50 wanting sustainable fitness', unique_angle: 'Science-based approach that fits busy schedules' },
    'identity.primary_goal':    'Scale to 100k subscribers and launch online coaching program',
    'identity.main_blocker':    'Hard to repurpose content across platforms efficiently',
    'identity.flow_variant':    'B_has_presence',
    'identity.north_star':      'Help 1 million people adopt a sustainable, healthy lifestyle',
    'capabilities.on_camera_comfort': true,
    'capabilities.weekly_hours_available': 20,
    'capabilities.current':     { execution: 91, audienceSignal: 88, clarity: 95, readiness: 82 },
    'platforms.focus':          { platform: 'youtube', handle: '@carolfit', follower_count: 67000 },
    'platforms.satellites':     [{ platform: 'instagram', handle: '@carolfit', status: 'active', follower_count: 34000 }],
    'followers_total':          67000,
    'current_followers':        67000,
    'avg_engagement_rate':      4.8,
    'posts_last_30d':           22,
    'last_post_date':           agoDate(0),
    'posts_per_week_average':   5,
    'avg_views_last10':         45000,
    'current_phase':            'F5',
    'vision_statement':         'Build the leading Spanish-language fitness education platform',
    'creative_purpose':         'Prove that fitness can be sustainable without extreme sacrifices',
    'brand_tone':               'energetic, scientific, motivational, warm',
    'content_style':            'long-form tutorials and quick reels with data overlays',
    'face_visibility_confirmed': true,
    'audience_persona':         { name: 'Carlos', age: '35-50', pain_points: ['no time for gym', 'conflicting nutrition advice', 'past fitness failures'], goals: ['lose 10kg sustainably', 'have more energy', 'build consistent habit'] },
    'content.pillars':          ['functional training', 'evidence-based nutrition', 'mindset', 'recovery'],
    'content.winner_format':    { format: 'long-form tutorial', confidence: 0.94, avg_er: 5.2, sample_size: 40 },
    'posting_frequency':        '5x/week',
    'best_posting_times':       ['Monday 07:00', 'Wednesday 07:00', 'Friday 07:00', 'Saturday 09:00', 'Sunday 20:00'],
    'energy_level':             'high',
    'batch_preference':         'batch_7d',
    'collaboration_style':      'collaborative',
    'media_kit':                { brand_colors: ['#FF6B35', '#1A1A2E'], fonts: ['Montserrat', 'Inter'], media_kit_url: 'https://carolfit.com/media-kit', updated_at: agoDate(10) },
    'offer_details':            { offer_title: 'FitPro 12-Week Program', offer_type: 'course', offer_price: 197, offer_audience: 'busy adults', value_proposition: 'Transform your fitness in 12 weeks with 30-min/day workouts' },
    'offer_defined':            true,
    'last_mission_date':        daysDate(0),
    'streak_freezes_available': 2,
    'streak_milestones_granted': [3, 7, 14, 30],
    'vip_badge':                true,
    'services.preference.channel': 'email',
    'services.preference.mode_default': 'human_expert',
    'services_preference_channel': 'email',
    'services_preference_mode_default': 'human_expert',
  }), 'project_id,fact_key')

  // ── 12. Brain signals ───────────────────────────────────────────────────
  log('12. Brain signals')
  const signals = [
    // Alice — F3 signals (18 days active)
    buildSignal(aliceProjId, 'scrape_completed',           { platform: 'instagram', followers: 12400, avg_er: 3.2, posts_7d: 4 }, 'scrape', 1),
    buildSignal(aliceProjId, 'scrape_completed',           { platform: 'instagram', followers: 11800, avg_er: 3.0, posts_7d: 3 }, 'scrape', 8),
    buildSignal(aliceProjId, 'growth.followers_total',     { value: 12400, platform: 'instagram' }, 'scrape', 1),
    buildSignal(aliceProjId, 'growth.acceleration',        { pct: 5.1, delta: 600, platform: 'instagram' }, 'scrape', 1),
    buildSignal(aliceProjId, 'engagement.avg_er_7d',       { value: 3.2, platform: 'instagram' }, 'scrape', 1),
    buildSignal(aliceProjId, 'consistency.posts_published_7d',  { value: 4, platform: 'instagram' }, 'scrape', 1),
    buildSignal(aliceProjId, 'consistency.posts_published_30d', { value: 16, platform: 'instagram' }, 'scrape', 1),
    buildSignal(aliceProjId, 'content_perf.viral_spike',   { post_id: 'IG_POST_123', multiplier: 3.8, platform: 'instagram' }, 'scrape', 5),
    buildSignal(aliceProjId, 'persona_defined',            { mission: 'AUDIENCE_PERSONA_V1' }, 'mission', 20),
    buildSignal(aliceProjId, 'content_style_defined',      { mission: 'CONTENT_COMFORT_STYLE_V1' }, 'mission', 25),
    buildSignal(aliceProjId, 'phase_changed',              { from: 'F2', to: 'F3' }, 'phase_engine', 10),
    buildSignal(aliceProjId, 'monetize_ready',         { followers: 12400, avg_er: 3.2 }, 'inflexion', 5),
    buildSignal(aliceProjId, 'content_published',          { platform: 'instagram', content_type: 'carousel', scheduled_at: agoDate(1) }, 'calendar', 1),
    buildSignal(aliceProjId, 'content_published',          { platform: 'instagram', content_type: 'reel',     scheduled_at: agoDate(3) }, 'calendar', 3),
    buildSignal(aliceProjId, 'content_published',          { platform: 'instagram', content_type: 'carousel', scheduled_at: agoDate(5) }, 'calendar', 5),
    buildSignal(aliceProjId, 'pulse_completed',            { action_items: 3 }, 'pulse', 1),
    buildSignal(aliceProjId, 'pulse_completed',            { action_items: 5 }, 'pulse', 2),

    // Bob — F0, minimal signals
    buildSignal(bobProjId, 'content_style_defined',        { mission: 'CONTENT_COMFORT_STYLE_V1' }, 'mission', 2),

    // Carol — F5 signals (heavy)
    buildSignal(carolProjId, 'scrape_completed',           { platform: 'youtube', followers: 67000, avg_er: 4.8, posts_7d: 3 }, 'scrape', 1),
    buildSignal(carolProjId, 'scrape_completed',           { platform: 'instagram', followers: 34000, avg_er: 5.1, posts_7d: 5 }, 'scrape', 1),
    buildSignal(carolProjId, 'scrape_completed',           { platform: 'youtube', followers: 64000, avg_er: 4.6, posts_7d: 2 }, 'scrape', 8),
    buildSignal(carolProjId, 'growth.followers_total',     { value: 67000, platform: 'youtube' }, 'scrape', 1),
    buildSignal(carolProjId, 'growth.acceleration',        { pct: 4.7, delta: 3000, platform: 'youtube' }, 'scrape', 1),
    buildSignal(carolProjId, 'engagement.avg_er_7d',       { value: 4.8, platform: 'youtube' }, 'scrape', 1),
    buildSignal(carolProjId, 'consistency.posts_published_7d',  { value: 5, platform: 'youtube' }, 'scrape', 1),
    buildSignal(carolProjId, 'consistency.posts_published_30d', { value: 22, platform: 'youtube' }, 'scrape', 1),
    buildSignal(carolProjId, 'content_perf.viral_spike',   { post_id: 'YT_VIDS_456', multiplier: 5.2, platform: 'youtube' }, 'scrape', 3),
    buildSignal(carolProjId, 'phase_changed',              { from: 'F4', to: 'F5' }, 'phase_engine', 15),
    buildSignal(carolProjId, 'phase_changed',              { from: 'F3', to: 'F4' }, 'phase_engine', 30),
    buildSignal(carolProjId, 'content_published',          { platform: 'youtube', content_type: 'video', scheduled_at: agoDate(0) }, 'calendar', 0),
    buildSignal(carolProjId, 'content_published',          { platform: 'instagram', content_type: 'reel', scheduled_at: agoDate(1) }, 'calendar', 1),
    buildSignal(carolProjId, 'content_published',          { platform: 'youtube', content_type: 'video', scheduled_at: agoDate(2) }, 'calendar', 2),
    buildSignal(carolProjId, 'collaboration.completed',    { partner: 'fitcoach_maria', platform: 'youtube', views: 85000 }, 'mission', 20),
    buildSignal(carolProjId, 'monetize_ready',         { followers: 67000, avg_er: 4.8 }, 'inflexion', 20),
    buildSignal(carolProjId, 'pulse_completed',            { action_items: 6 }, 'pulse', 0),
    buildSignal(carolProjId, 'pulse_completed',            { action_items: 4 }, 'pulse', 1),
  ]
  for (const s of signals) await ins('brain_signals', s)

  // ── 13. Brain snapshots ─────────────────────────────────────────────────
  log('13. Brain snapshots')
  const snapshotHash = (s) => crypto.createHash('sha256').update(s).digest('hex')
  await ins('brain_snapshots', [
    {
      project_id: aliceProjId,
      snapshot_type: 'onboarding_completed',
      phase_code: 'F0',
      facts_snapshot: { 'identity.niche': 'Personal finance', 'platforms.focus': { platform: 'instagram' } },
      trigger_source: 'onboarding_completed',
      snapshot_hash: snapshotHash(`alice_onboarding_${aliceProjId}`),
    },
    {
      project_id: aliceProjId,
      snapshot_type: 'phase_assigned',
      phase_code: 'F3',
      facts_snapshot: { 'current_phase': 'F3', 'followers_total': 12400 },
      trigger_source: 'phase_changed',
      snapshot_hash: snapshotHash(`alice_phase_f3_${aliceProjId}`),
    },
    {
      project_id: bobProjId,
      snapshot_type: 'onboarding_completed',
      phase_code: 'F0',
      facts_snapshot: { 'identity.niche': 'Productivity and minimalism' },
      trigger_source: 'onboarding_completed',
      snapshot_hash: snapshotHash(`bob_onboarding_${bobProjId}`),
    },
    {
      project_id: carolProjId,
      snapshot_type: 'onboarding_completed',
      phase_code: 'F0',
      facts_snapshot: { 'identity.niche': 'Fitness', 'platforms.focus': { platform: 'youtube' } },
      trigger_source: 'onboarding_completed',
      snapshot_hash: snapshotHash(`carol_onboarding_${carolProjId}`),
    },
    {
      project_id: carolProjId,
      snapshot_type: 'phase_assigned',
      phase_code: 'F5',
      facts_snapshot: { 'current_phase': 'F5', 'followers_total': 67000 },
      trigger_source: 'phase_changed',
      snapshot_hash: snapshotHash(`carol_phase_f5_${carolProjId}`),
    },
  ])

  // ── 14. Platform metrics ────────────────────────────────────────────────
  log('14. Platform metrics')
  // Alice — Instagram (2 historical rows)
  await ins('platform_metrics', [
    { project_id: aliceProjId, platform: 'instagram', handle: '@alicefinance', followers_count: 11800, avg_engagement_rate: 0.0300, avg_views: 7800, avg_likes: 354, avg_comments: 32, recent_posts_7d: 3, fetched_at: ago(8) },
    { project_id: aliceProjId, platform: 'instagram', handle: '@alicefinance', followers_count: 12400, avg_engagement_rate: 0.0320, avg_views: 8500, avg_likes: 397, avg_comments: 40, recent_posts_7d: 4, fetched_at: ago(1) },
    // Carol — YouTube (focus) + Instagram (satellite)
    { project_id: carolProjId, platform: 'youtube',   handle: '@carolfit',     followers_count: 64000, avg_engagement_rate: 0.0460, avg_views: 41000, avg_likes: 1886, avg_comments: 211, recent_posts_7d: 2, fetched_at: ago(8) },
    { project_id: carolProjId, platform: 'youtube',   handle: '@carolfit',     followers_count: 67000, avg_engagement_rate: 0.0480, avg_views: 45000, avg_likes: 2160, avg_comments: 250, recent_posts_7d: 3, fetched_at: ago(1) },
    { project_id: carolProjId, platform: 'instagram', handle: '@carolfit',     followers_count: 32000, avg_engagement_rate: 0.0510, avg_views: 22000, avg_likes: 1632, avg_comments: 98,  recent_posts_7d: 5, fetched_at: ago(2) },
    { project_id: carolProjId, platform: 'instagram', handle: '@carolfit',     followers_count: 34000, avg_engagement_rate: 0.0510, avg_views: 24000, avg_likes: 1734, avg_comments: 110, recent_posts_7d: 5, fetched_at: ago(1) },
  ])

  // ── 15. Scrape runs ──────────────────────────────────────────────────────
  log('15. Core scrape runs')
  await ins('core_scrape_runs', [
    {
      project_id: aliceProjId, platform: 'instagram', handle: '@alicefinance',
      period_start: agoDate(8), period_end: agoDate(8),
      raw_json: { followers: 11800 }, normalized_json: { followers_total: 11800, avg_er_estimated: 0.030 },
      idempotency_key: `instagram:@alicefinance:${agoDate(8)}`,
      fetched_at: ago(8),
    },
    {
      project_id: aliceProjId, platform: 'instagram', handle: '@alicefinance',
      period_start: agoDate(1), period_end: agoDate(1),
      raw_json: { followers: 12400 }, normalized_json: { followers_total: 12400, avg_er_estimated: 0.032 },
      idempotency_key: `instagram:@alicefinance:${agoDate(1)}`,
      fetched_at: ago(1),
    },
    {
      project_id: carolProjId, platform: 'youtube', handle: '@carolfit',
      period_start: agoDate(1), period_end: agoDate(1),
      raw_json: { subscribers: 67000 }, normalized_json: { followers_total: 67000, avg_er_estimated: 0.048 },
      idempotency_key: `youtube:@carolfit:${agoDate(1)}`,
      fetched_at: ago(1),
    },
    {
      project_id: carolProjId, platform: 'instagram', handle: '@carolfit',
      period_start: agoDate(1), period_end: agoDate(1),
      raw_json: { followers: 34000 }, normalized_json: { followers_total: 34000, avg_er_estimated: 0.051 },
      idempotency_key: `instagram:@carolfit:${agoDate(1)}`,
      fetched_at: ago(1),
    },
  ])

  // ── 16. Core jobs ────────────────────────────────────────────────────────
  log('16. Core jobs')
  await ins('core_jobs', [
    // Alice — completed scrape job
    {
      project_id: aliceProjId, user_id: alice.id, job_type: 'scrape_light', status: 'done',
      priority: 'normal', attempts: 1, max_attempts: 3,
      payload_json: { platform: 'instagram', handle: '@alicefinance' },
      idempotency_key: `${aliceProjId}:scrape_light:instagram:${agoDate(1)}`,
      started_at: ago(1), finished_at: ago(1), cost_premium_credits: 5,
    },
    // Carol — completed YouTube scrape, queued Instagram scrape
    {
      project_id: carolProjId, user_id: carol.id, job_type: 'scrape_light', status: 'done',
      priority: 'normal', attempts: 1, max_attempts: 3,
      payload_json: { platform: 'youtube', handle: '@carolfit' },
      idempotency_key: `${carolProjId}:scrape_light:youtube:${agoDate(1)}`,
      started_at: ago(1), finished_at: ago(1), cost_premium_credits: 5,
    },
    {
      project_id: carolProjId, user_id: carol.id, job_type: 'scrape_light', status: 'done',
      priority: 'normal', attempts: 1, max_attempts: 3,
      payload_json: { platform: 'instagram', handle: '@carolfit' },
      idempotency_key: `${carolProjId}:scrape_light:instagram:${agoDate(1)}`,
      started_at: ago(1), finished_at: ago(1), cost_premium_credits: 5,
    },
    // Bob — failed scrape (no handle confirmed yet)
    {
      project_id: bobProjId, user_id: bob.id, job_type: 'scrape_light', status: 'failed',
      priority: 'normal', attempts: 3, max_attempts: 3,
      payload_json: { platform: 'instagram', handle: '@bobminimalist' },
      idempotency_key: `${bobProjId}:scrape_light:instagram:${agoDate(2)}`,
      started_at: ago(2), finished_at: ago(2), cost_premium_credits: 5,
      error_text: 'Account not found or private',
    },
  ])

  // ── 17. Phase engine runs ────────────────────────────────────────────────
  log('17. Phase engine runs')
  await ins('core_phase_runs', [
    {
      project_id: aliceProjId, phase_code: 'F3', capability_score: 74,
      dimension_scores: { execution: 72, audienceSignal: 68, clarity: 85, readiness: 60 },
      gates_json: { F1: true, F2: true, F3: true, F4: false },
      confidence: 0.88, reason_summary: 'F3 gates pass: streak 18d, ER 3.2%, winner_format confirmed',
      input_hash: snapshotHash(`alice_phase_input_${aliceProjId}`),
      computed_at: ago(1),
    },
    {
      project_id: bobProjId, phase_code: 'F0', capability_score: 8,
      dimension_scores: { execution: 5, audienceSignal: 0, clarity: 20, readiness: 10 },
      gates_json: { F1: false },
      confidence: 0.95, reason_summary: 'F0: no publications, no platform metrics yet',
      input_hash: snapshotHash(`bob_phase_input_${bobProjId}`),
      computed_at: ago(1),
    },
    {
      project_id: carolProjId, phase_code: 'F5', capability_score: 90,
      dimension_scores: { execution: 91, audienceSignal: 88, clarity: 95, readiness: 82 },
      gates_json: { F1: true, F2: true, F3: true, F4: true, F5: true, F6: false },
      confidence: 0.92, reason_summary: 'F5 gates pass: media_kit defined, 5+ batches, 1 collaboration',
      input_hash: snapshotHash(`carol_phase_input_${carolProjId}`),
      computed_at: ago(1),
    },
  ])

  // ── 18. Policy engine runs ───────────────────────────────────────────────
  log('18. Policy engine runs')
  await ins('core_policy_runs', [
    {
      project_id: aliceProjId,
      input_ref: { phase: 'F3', mode: 'monetize', wallet_balance: 1200 },
      output_json: { active_mode: 'monetize', mission_queue_delta: ['DEFINE_OFFER_V1'], rationale: 'F3+ with monetization signals — focus on product definition' },
    },
    {
      project_id: bobProjId,
      input_ref: { phase: 'F0', mode: 'test', wallet_balance: 495 },
      output_json: { active_mode: 'test', mission_queue_delta: ['VISION_PURPOSE_MOODBOARD_V1'], rationale: 'Core Flow gate: first mission in queue' },
    },
    {
      project_id: carolProjId,
      input_ref: { phase: 'F5', mode: 'scale', wallet_balance: 4600 },
      output_json: { active_mode: 'scale', mission_queue_delta: ['CONTENT_BATCH_3D_V1', 'AUDIENCE_PERSONA_V1'], rationale: 'F5 scale mode: batch execution and satellite platform expansion' },
    },
  ])

  // ── 19. Mission instances ────────────────────────────────────────────────
  log('19. Mission instances')

  // Alice — all 5 CORE_FLOW completed + extra missions
  const aliceMissions = [
    buildMissionInstance(aliceProjId, 'VISION_PURPOSE_MOODBOARD_V1',  'completed', 28),
    buildMissionInstance(aliceProjId, 'CONTENT_COMFORT_STYLE_V1',     'completed', 25),
    buildMissionInstance(aliceProjId, 'PLATFORM_STRATEGY_PICKER_V1',  'completed', 22),
    buildMissionInstance(aliceProjId, 'NICHE_CONFIRM_V1',             'completed', 18),
    buildMissionInstance(aliceProjId, 'PREFERENCES_CAPTURE_V1',       'completed', 15),
    buildMissionInstance(aliceProjId, 'AUDIENCE_PERSONA_V1',          'completed', 12),
    buildMissionInstance(aliceProjId, 'BRAND_KIT_LITE_V1',            'completed', 10),
    buildMissionInstance(aliceProjId, 'BATCH_CONFIG_V1',              'completed',  8),
    buildMissionInstance(aliceProjId, 'DEFINE_OFFER_V1',              'needs_user_input', null),
  ]

  // Bob — VISION in needs_user_input
  const bobMissions = [
    buildMissionInstance(bobProjId, 'VISION_PURPOSE_MOODBOARD_V1', 'needs_user_input', null),
    buildMissionInstance(bobProjId, 'CONTENT_COMFORT_STYLE_V1',    'queued',           null),
    buildMissionInstance(bobProjId, 'PLATFORM_STRATEGY_PICKER_V1', 'queued',           null),
    buildMissionInstance(bobProjId, 'NICHE_CONFIRM_V1',            'queued',           null),
    buildMissionInstance(bobProjId, 'PREFERENCES_CAPTURE_V1',      'queued',           null),
  ]

  // Carol — all 5 CORE_FLOW + many more completed
  const carolMissions = [
    buildMissionInstance(carolProjId, 'VISION_PURPOSE_MOODBOARD_V1',  'completed', 85),
    buildMissionInstance(carolProjId, 'CONTENT_COMFORT_STYLE_V1',     'completed', 82),
    buildMissionInstance(carolProjId, 'PLATFORM_STRATEGY_PICKER_V1',  'completed', 78),
    buildMissionInstance(carolProjId, 'NICHE_CONFIRM_V1',             'completed', 75),
    buildMissionInstance(carolProjId, 'PREFERENCES_CAPTURE_V1',       'completed', 72),
    buildMissionInstance(carolProjId, 'AUDIENCE_PERSONA_V1',          'completed', 60),
    buildMissionInstance(carolProjId, 'BRAND_KIT_LITE_V1',            'completed', 55),
    buildMissionInstance(carolProjId, 'BATCH_CONFIG_V1',              'completed', 50),
    buildMissionInstance(carolProjId, 'DEFINE_OFFER_V1',              'completed', 45),
    buildMissionInstance(carolProjId, 'CONTENT_BATCH_3D_V1',          'completed', 14),
    buildMissionInstance(carolProjId, 'CONTENT_BATCH_3D_V1',          'completed',  7),  // repeated
    buildMissionInstance(carolProjId, 'AUDIENCE_PERSONA_V1',          'running',  null),
  ]

  // Fix carol duplicate: give the second CONTENT_BATCH a different key
  carolMissions[10].unique_key = `${carolProjId}:CONTENT_BATCH_3D_V1:${agoDate(7)}`
  carolMissions[11].unique_key = `${carolProjId}:AUDIENCE_PERSONA_V1:${daysDate(0)}-v2`

  const allMissions = [...aliceMissions, ...bobMissions, ...carolMissions]
  for (const m of allMissions) await ins('mission_instances', m)

  // ── 20. Core outputs (content assets) ───────────────────────────────────
  log('20. Core outputs')
  // Delete calendar items first (FK dep), then outputs, so re-run is clean
  await admin.from('core_calendar_items').delete().eq('project_id', aliceProjId)
  await admin.from('core_calendar_items').delete().eq('project_id', carolProjId)
  await admin.from('core_outputs').delete().eq('project_id', aliceProjId)
  await admin.from('core_outputs').delete().eq('project_id', carolProjId)
  const aliceOut1 = uuid(); const aliceOut2 = uuid()
  const carolOut1 = uuid(); const carolOut2 = uuid(); const carolOut3 = uuid()

  await ins('core_outputs', [
    // Alice
    {
      id: aliceOut1, project_id: aliceProjId,
      output_type: 'carousel', format: 'carousel', platform: 'instagram',
      content: { hook: '5 investment mistakes most 30-year-olds make 💸', caption: 'Are you making these? Save this before you invest a single euro...', slides: ['Mistake 1: Waiting for the "perfect moment"', 'Mistake 2: Not diversifying', 'Mistake 3: Ignoring fees'], hashtags: ['#finanzaspersonales', '#inversiones', '#millennialmoney'], cta: 'Share with a friend who needs this!' },
      status: 'published', idempotency_key: `output_alice_carousel_1`,
    },
    {
      id: aliceOut2, project_id: aliceProjId,
      output_type: 'reel', format: 'reel', platform: 'instagram',
      content: { hook: 'How I saved €1000 in 30 days on a €2000 salary', script_outline: ['Intro: my situation', 'Rule 1: 50/30/20', 'Rule 2: No impulse buys', 'Result: €1,127 saved'], cta: 'Comment your monthly savings goal 👇', hashtags: ['#ahorro', '#finanzas', '#goals'] },
      status: 'approved', idempotency_key: `output_alice_reel_1`,
    },
    // Carol
    {
      id: carolOut1, project_id: carolProjId,
      output_type: 'video', format: 'long_form', platform: 'youtube',
      content: { title: 'The 30-Minute Full Body Workout That Actually Works (No Equipment)', description: 'Science-backed functional training you can do anywhere...', talking_points: ['Why traditional cardio fails', 'The 4-movement pattern', 'Progressive overload at home', 'Real results from followers'], cta: 'Subscribe for weekly workouts', tags: ['fitness', 'workout', 'noequipment'] },
      status: 'published', idempotency_key: `output_carol_video_1`,
    },
    {
      id: carolOut2, project_id: carolProjId,
      output_type: 'reel', format: 'reel', platform: 'instagram',
      content: { hook: 'This 10-minute morning routine changed my clients\' lives 🔥', script_outline: ['Min 1: breathwork', 'Min 2-5: mobility', 'Min 6-10: activation'], hashtags: ['#fitness', '#morningroutine', '#saludable', '#habitos'] },
      status: 'published', idempotency_key: `output_carol_reel_1`,
    },
    {
      id: carolOut3, project_id: carolProjId,
      output_type: 'video', format: 'long_form', platform: 'youtube',
      content: { title: 'Nutrition Myths That Are Destroying Your Progress', description: 'Evidence-based nutrition guide...', talking_points: ['Myth 1: Carbs are bad', 'Myth 2: You need supplements', 'Myth 3: Eat less to lose more'] },
      status: 'draft', idempotency_key: `output_carol_video_2`,
    },
  ])

  // ── 21. Calendar items ───────────────────────────────────────────────────
  log('21. Calendar items')
  await ins('core_calendar_items', [
    // Alice — past published + upcoming scheduled
    { project_id: aliceProjId, output_id: aliceOut1, platform: 'instagram', scheduled_at: ago(5),  status: 'published', state: 'published', published_at: ago(5),  content_type: 'carousel', idempotency_key: `cal_alice_ig_${agoDate(5)}_carousel` },
    { project_id: aliceProjId, output_id: aliceOut2, platform: 'instagram', scheduled_at: ago(3),  status: 'published', state: 'published', published_at: ago(3),  content_type: 'reel',     idempotency_key: `cal_alice_ig_${agoDate(3)}_reel`    },
    { project_id: aliceProjId,                       platform: 'instagram', scheduled_at: ago(1),  status: 'published', state: 'published', published_at: ago(1),  content_type: 'carousel', idempotency_key: `cal_alice_ig_${agoDate(1)}_carousel` },
    { project_id: aliceProjId,                       platform: 'instagram', scheduled_at: days(1), status: 'scheduled', state: 'scheduled',                        content_type: 'reel',     idempotency_key: `cal_alice_ig_${daysDate(1)}_reel`    },
    { project_id: aliceProjId,                       platform: 'instagram', scheduled_at: days(3), status: 'scheduled', state: 'scheduled',                        content_type: 'carousel', idempotency_key: `cal_alice_ig_${daysDate(3)}_carousel` },
    { project_id: aliceProjId,                       platform: 'instagram', scheduled_at: days(5), status: 'draft',     state: 'draft',                            content_type: 'reel',     idempotency_key: `cal_alice_ig_${daysDate(5)}_reel`    },
    { project_id: aliceProjId,                       platform: 'instagram', scheduled_at: days(7), status: 'draft',     state: 'draft',                            content_type: 'carousel', idempotency_key: `cal_alice_ig_${daysDate(7)}_carousel` },
    // Carol — YouTube + Instagram multi-platform
    { project_id: carolProjId, output_id: carolOut1, platform: 'youtube',   scheduled_at: ago(2),  status: 'published', state: 'published', published_at: ago(2),  content_type: 'video',    idempotency_key: `cal_carol_yt_${agoDate(2)}_video`   },
    { project_id: carolProjId, output_id: carolOut2, platform: 'instagram', scheduled_at: ago(1),  status: 'published', state: 'published', published_at: ago(1),  content_type: 'reel',     idempotency_key: `cal_carol_ig_${agoDate(1)}_reel`    },
    { project_id: carolProjId,                       platform: 'youtube',   scheduled_at: days(2), status: 'scheduled', state: 'scheduled',                        content_type: 'video',    idempotency_key: `cal_carol_yt_${daysDate(2)}_video`  },
    { project_id: carolProjId,                       platform: 'instagram', scheduled_at: days(2), status: 'scheduled', state: 'scheduled',                        content_type: 'reel',     idempotency_key: `cal_carol_ig_${daysDate(2)}_reel`   },
    { project_id: carolProjId, output_id: carolOut3, platform: 'youtube',   scheduled_at: days(4), status: 'draft',     state: 'draft',                            content_type: 'video',    idempotency_key: `cal_carol_yt_${daysDate(4)}_video`  },
    { project_id: carolProjId,                       platform: 'instagram', scheduled_at: days(4), status: 'draft',     state: 'draft',                            content_type: 'reel',     idempotency_key: `cal_carol_ig_${daysDate(4)}_reel`   },
    { project_id: carolProjId,                       platform: 'youtube',   scheduled_at: days(6), status: 'draft',     state: 'draft',                            content_type: 'video',    idempotency_key: `cal_carol_yt_${daysDate(6)}_video`  },
    // Bob — one draft item
    { project_id: bobProjId,                         platform: 'instagram', scheduled_at: days(3), status: 'draft',     state: 'draft',                            content_type: 'post',     idempotency_key: `cal_bob_ig_${daysDate(3)}_post`     },
  ])

  // ── 22. Monetization products ────────────────────────────────────────────
  log('22. Monetization products')
  const aliceProd1 = uuid(); const aliceProd2 = uuid(); const aliceProd3 = uuid()
  const carolProd1 = uuid(); const carolProd2 = uuid(); const carolProd3 = uuid(); const carolProd4 = uuid(); const carolProd5 = uuid()

  await ins('monetization_products', [
    // Alice — 3 products
    { id: aliceProd1, project_id: aliceProjId, name: 'Finance Starter Kit', type: 'digital_product', price_amount: 29, price_currency: 'EUR', status: 'active',  platform: 'gumroad',  url: 'https://gumroad.com/l/finance-starter-alice', notes: '5-step investing roadmap PDF + spreadsheet' },
    { id: aliceProd2, project_id: aliceProjId, name: '1:1 Finance Coaching', type: 'service',         price_amount: 150, price_currency: 'EUR', status: 'active', platform: 'calendly', url: 'https://calendly.com/alicefinance/coaching',  notes: '60-min personalized financial planning session' },
    { id: aliceProd3, project_id: aliceProjId, name: 'Finance Community',   type: 'membership',      price_amount: 9,   price_currency: 'EUR', status: 'paused', platform: 'patreon',  url: null, notes: 'Monthly community — paused while building content' },
    // Carol — 5 products
    { id: carolProd1, project_id: carolProjId, name: 'FitPro 12-Week Program',    type: 'course',          price_amount: 197, price_currency: 'EUR', status: 'active',   platform: 'teachable', url: 'https://carolfit.teachable.com/p/fitpro',      notes: 'Main flagship product' },
    { id: carolProd2, project_id: carolProjId, name: 'Elite Coaching (Monthly)',  type: 'service',         price_amount: 500, price_currency: 'EUR', status: 'active',   platform: 'stripe',    url: 'https://buy.stripe.com/carolfit-coaching',     notes: '4 sessions/month + WhatsApp support' },
    { id: carolProd3, project_id: carolProjId, name: 'FitStart 4-Week Plan',      type: 'digital_product', price_amount: 47,  price_currency: 'EUR', status: 'active',   platform: 'gumroad',   url: 'https://gumroad.com/l/fitstart-carol',         notes: 'Entry-level program for beginners' },
    { id: carolProd4, project_id: carolProjId, name: 'Gymshark Affiliate',        type: 'affiliate',       price_amount: null, price_currency: 'EUR', status: 'active',  platform: 'gymshark',  url: 'https://gymshark.com?ref=carolfit',            notes: '10% commission on referred sales' },
    { id: carolProd5, project_id: carolProjId, name: 'Protein Brand Sponsorship', type: 'brand_deal',      price_amount: 2000, price_currency: 'EUR', status: 'archived', platform: 'instagram', url: null,                                          notes: 'Q1 brand deal — completed' },
  ])

  // ── 23. Monetization events ──────────────────────────────────────────────
  log('23. Monetization events')
  await ins('monetization_events', [
    // Alice events — Finance Starter Kit sales + coaching sessions
    { project_id: aliceProjId, product_id: aliceProd1, event_type: 'sale', amount: 29,  currency: 'EUR', source: 'manual', event_date: agoDate(25), note: 'Launched to email list' },
    { project_id: aliceProjId, product_id: aliceProd1, event_type: 'sale', amount: 29,  currency: 'EUR', source: 'manual', event_date: agoDate(20), note: null },
    { project_id: aliceProjId, product_id: aliceProd1, event_type: 'sale', amount: 29,  currency: 'EUR', source: 'manual', event_date: agoDate(15), note: null },
    { project_id: aliceProjId, product_id: aliceProd1, event_type: 'sale', amount: 29,  currency: 'EUR', source: 'manual', event_date: agoDate(10), note: 'Viral reel drove traffic' },
    { project_id: aliceProjId, product_id: aliceProd1, event_type: 'sale', amount: 29,  currency: 'EUR', source: 'manual', event_date: agoDate(5),  note: null },
    { project_id: aliceProjId, product_id: aliceProd1, event_type: 'sale', amount: 29,  currency: 'EUR', source: 'manual', event_date: agoDate(2),  note: null },
    { project_id: aliceProjId, product_id: aliceProd2, event_type: 'sale', amount: 150, currency: 'EUR', source: 'manual', event_date: agoDate(18), note: 'DM lead converted' },
    { project_id: aliceProjId, product_id: aliceProd2, event_type: 'sale', amount: 150, currency: 'EUR', source: 'manual', event_date: agoDate(8),  note: null },
    { project_id: aliceProjId, product_id: aliceProd3, event_type: 'subscription_start', amount: 9, currency: 'EUR', source: 'manual', event_date: agoDate(12), note: 'Early adopter' },
    { project_id: aliceProjId, product_id: aliceProd3, event_type: 'subscription_cancel', amount: 0, currency: 'EUR', source: 'manual', event_date: agoDate(4), note: 'Paused community' },
    { project_id: aliceProjId, product_id: null,       event_type: 'inquiry', amount: 0, currency: 'EUR', source: 'manual', event_date: agoDate(3), note: '5 DM inquiries about coaching this week' },
    { project_id: aliceProjId, product_id: null,       event_type: 'lead',    amount: 0, currency: 'EUR', source: 'llm_inferred', event_date: agoDate(1), note: 'Link clicks from bio' },

    // Carol events — major revenue, multiple products
    { project_id: carolProjId, product_id: carolProd1, event_type: 'sale', amount: 197, currency: 'EUR', source: 'stripe_webhook', event_date: agoDate(30), note: 'Launch day' },
    { project_id: carolProjId, product_id: carolProd1, event_type: 'sale', amount: 197, currency: 'EUR', source: 'stripe_webhook', event_date: agoDate(28), note: null },
    { project_id: carolProjId, product_id: carolProd1, event_type: 'sale', amount: 197, currency: 'EUR', source: 'stripe_webhook', event_date: agoDate(25), note: null },
    { project_id: carolProjId, product_id: carolProd1, event_type: 'sale', amount: 197, currency: 'EUR', source: 'stripe_webhook', event_date: agoDate(20), note: null },
    { project_id: carolProjId, product_id: carolProd1, event_type: 'sale', amount: 197, currency: 'EUR', source: 'stripe_webhook', event_date: agoDate(15), note: null },
    { project_id: carolProjId, product_id: carolProd1, event_type: 'sale', amount: 197, currency: 'EUR', source: 'stripe_webhook', event_date: agoDate(10), note: null },
    { project_id: carolProjId, product_id: carolProd1, event_type: 'sale', amount: 197, currency: 'EUR', source: 'stripe_webhook', event_date: agoDate(5),  note: null },
    { project_id: carolProjId, product_id: carolProd1, event_type: 'sale', amount: 197, currency: 'EUR', source: 'stripe_webhook', event_date: agoDate(2),  note: null },
    { project_id: carolProjId, product_id: carolProd1, event_type: 'refund', amount: 197, currency: 'EUR', source: 'stripe_webhook', event_date: agoDate(24), note: 'Requested within 48h' },
    { project_id: carolProjId, product_id: carolProd2, event_type: 'subscription_start', amount: 500, currency: 'EUR', source: 'stripe_webhook', event_date: agoDate(60), note: 'Client 1' },
    { project_id: carolProjId, product_id: carolProd2, event_type: 'subscription_start', amount: 500, currency: 'EUR', source: 'stripe_webhook', event_date: agoDate(45), note: 'Client 2' },
    { project_id: carolProjId, product_id: carolProd2, event_type: 'subscription_start', amount: 500, currency: 'EUR', source: 'stripe_webhook', event_date: agoDate(30), note: 'Client 3' },
    { project_id: carolProjId, product_id: carolProd2, event_type: 'subscription_cancel', amount: 0, currency: 'EUR', source: 'stripe_webhook', event_date: agoDate(15), note: 'Client 1 cancelled' },
    { project_id: carolProjId, product_id: carolProd3, event_type: 'sale', amount: 47, currency: 'EUR', source: 'manual', event_date: agoDate(20), note: null },
    { project_id: carolProjId, product_id: carolProd3, event_type: 'sale', amount: 47, currency: 'EUR', source: 'manual', event_date: agoDate(10), note: null },
    { project_id: carolProjId, product_id: carolProd3, event_type: 'sale', amount: 47, currency: 'EUR', source: 'manual', event_date: agoDate(3),  note: null },
    { project_id: carolProjId, product_id: carolProd4, event_type: 'sale', amount: 85, currency: 'EUR', source: 'llm_inferred', event_date: agoDate(15), note: 'Affiliate commission estimate' },
    { project_id: carolProjId, product_id: carolProd4, event_type: 'sale', amount: 120, currency: 'EUR', source: 'llm_inferred', event_date: agoDate(5), note: 'Affiliate commission estimate' },
    { project_id: carolProjId, product_id: carolProd5, event_type: 'sale', amount: 2000, currency: 'EUR', source: 'manual', event_date: agoDate(40), note: 'Q1 brand deal payment' },
    { project_id: carolProjId, product_id: null,       event_type: 'inquiry', amount: 0, currency: 'EUR', source: 'manual', event_date: agoDate(2), note: '3 brand collaboration inquiries' },
  ])

  // ── 24. Pulse runs ───────────────────────────────────────────────────────
  log('24. Pulse runs')
  await ins('pulse_runs', [
    // Alice — 2 pulse runs
    {
      project_id: aliceProjId, triggered_by: 'schedule', phase_code: 'F3',
      signals_collected: 12, events_detected: 2, missions_assigned: 1,
      summary: 'Strong week: 4 posts, ER above 3%. Viral spike on finance carousel.',
      action_items: [
        { priority: 'high',   category: 'content',       action: 'Repurpose your viral carousel into a Reel with the same hook — publish within 48h', reasoning: 'Viral content compounds when cross-posted quickly' },
        { priority: 'medium', category: 'monetization',  action: 'Add a link to your Finance Starter Kit in your bio and next 2 captions', reasoning: 'You have 5 DM inquiries — reduce friction to purchase' },
        { priority: 'low',    category: 'growth',        action: 'Reply to every comment on your top post this week', reasoning: 'ER is 3.2% — push it above 4% to hit F4 gate' },
      ],
      started_at: ago(1), completed_at: ago(1),
    },
    {
      project_id: aliceProjId, triggered_by: 'schedule', phase_code: 'F3',
      signals_collected: 10, events_detected: 1, missions_assigned: 0,
      summary: 'Consistent posting week. Monetization momentum building.',
      action_items: [
        { priority: 'high',   category: 'monetization', action: 'Complete your DEFINE_OFFER mission — you have an audience ready to buy', reasoning: 'Offer defined fact missing; monetize mode blocked' },
        { priority: 'medium', category: 'consistency',  action: 'Schedule next 7 days of content in one batch session', reasoning: 'Batch creation reduces burnout and improves consistency' },
      ],
      started_at: ago(2), completed_at: ago(2),
    },
    // Bob — first pulse (minimal data)
    {
      project_id: bobProjId, triggered_by: 'event', phase_code: 'F0',
      signals_collected: 2, events_detected: 0, missions_assigned: 1,
      summary: 'Getting started! Complete your first mission to unlock more insights.',
      action_items: [
        { priority: 'high', category: 'missions', action: 'Complete the Vision & Purpose mission — it takes 10 minutes and unlocks everything', reasoning: 'Core Flow gate: no missions completed yet' },
      ],
      started_at: ago(1), completed_at: ago(1),
    },
    // Carol — 2 pulse runs
    {
      project_id: carolProjId, triggered_by: 'schedule', phase_code: 'F5',
      signals_collected: 28, events_detected: 4, missions_assigned: 2,
      summary: 'Exceptional week: YouTube video viral spike (5.2x). Instagram engagement strong. Revenue on track.',
      action_items: [
        { priority: 'high',   category: 'content',      action: 'Create a Part 2 of your viral "30-Minute Workout" video — strike while iron is hot', reasoning: 'Viral multiplier 5.2x — algorithm is boosting your channel' },
        { priority: 'high',   category: 'monetization', action: 'Add FitPro CTA to your viral video description and pin a comment', reasoning: '45k views is a conversion opportunity — add friction-free link' },
        { priority: 'medium', category: 'growth',       action: 'Respond to top 20 comments on viral video to boost ER for algorithm', reasoning: 'YouTube rewards comment engagement in first 48h' },
        { priority: 'low',    category: 'platforms',    action: 'Repurpose viral video into 3 Instagram Reels this week', reasoning: 'F6 gate requires ≥10 repurposed items/month' },
      ],
      started_at: ago(0), completed_at: ago(0),
    },
    {
      project_id: carolProjId, triggered_by: 'schedule', phase_code: 'F5',
      signals_collected: 22, events_detected: 2, missions_assigned: 1,
      summary: 'Strong consistency. Revenue growing. Focus on cross-platform repurposing to hit F6.',
      action_items: [
        { priority: 'high',   category: 'growth',       action: 'Set up systematic repurposing: 1 YouTube video → 3 Reels → 5 Stories each week', reasoning: 'F6 gate requires ≥10 repurposed items/month — currently at 4' },
        { priority: 'medium', category: 'monetization', action: 'Contact 3 new brand collaboration opportunities this week', reasoning: 'F5 gate requires ≥1 successful collaboration — you met it; F6 needs more' },
      ],
      started_at: ago(1), completed_at: ago(1),
    },
  ])

  // ── 25. Notifications ────────────────────────────────────────────────────
  log('25. Notifications')
  await ins('notifications', [
    // Alice — mix of read and unread
    { project_id: aliceProjId, user_id: alice.id, type: 'publish_success',   title: 'Content published', body: 'Your carousel was published on instagram.', delivery_channel: 'in_app', sent_at: ago(1), read_at: ago(1), metadata_json: { platform: 'instagram', content_type: 'carousel' } },
    { project_id: aliceProjId, user_id: alice.id, type: 'publish_success',   title: 'Content published', body: 'Your reel was published on instagram.',    delivery_channel: 'in_app', sent_at: ago(3), read_at: ago(3), metadata_json: { platform: 'instagram', content_type: 'reel'     } },
    { project_id: aliceProjId, user_id: alice.id, type: 'weekly_digest',     title: 'Your weekly growth summary', body: '3 missions · 4 posts · +600 followers', delivery_channel: 'email', sent_at: ago(7), read_at: ago(7), metadata_json: { missionsCompleted: 3, contentPublished: 4, followerDelta: 600 } },
    { project_id: aliceProjId, user_id: alice.id, type: 'mission_reminder',  title: 'Mission waiting for your input', body: 'Your mission "define offer" is waiting for your response.', delivery_channel: 'email', sent_at: ago(0), read_at: null, metadata_json: { mission_instance_id: aliceMissions[8].id, template_code: 'DEFINE_OFFER_V1' } },
    { project_id: aliceProjId, user_id: alice.id, type: 'capability_followup', title: 'You\'re ready for monetize mode!', body: 'Your ER hit 3.2% and you have 12k followers. Time to define your first offer.', delivery_channel: 'in_app', sent_at: ago(5), read_at: null, metadata_json: {} },
    // Bob — unread mission reminder
    { project_id: bobProjId, user_id: bob.id, type: 'mission_reminder', title: 'Mission waiting for your input', body: 'Your mission "vision purpose moodboard" is waiting for your response.', delivery_channel: 'email', sent_at: ago(1), read_at: null, metadata_json: { mission_instance_id: bobMissions[0].id, template_code: 'VISION_PURPOSE_MOODBOARD_V1' } },
    // Carol — multiple notifications
    { project_id: carolProjId, user_id: carol.id, type: 'publish_success',   title: 'Content published', body: 'Your video was published on youtube.',    delivery_channel: 'in_app', sent_at: ago(2), read_at: ago(2), metadata_json: { platform: 'youtube',    content_type: 'video'   } },
    { project_id: carolProjId, user_id: carol.id, type: 'publish_success',   title: 'Content published', body: 'Your reel was published on instagram.',   delivery_channel: 'in_app', sent_at: ago(1), read_at: ago(1), metadata_json: { platform: 'instagram', content_type: 'reel'    } },
    { project_id: carolProjId, user_id: carol.id, type: 'weekly_digest',     title: 'Your weekly growth summary', body: '5 missions · 7 posts · +3000 followers', delivery_channel: 'email', sent_at: ago(7), read_at: ago(6), metadata_json: { missionsCompleted: 5, contentPublished: 7, followerDelta: 3000 } },
    { project_id: carolProjId, user_id: carol.id, type: 'capability_followup', title: 'Viral spike detected! 🚀', body: 'Your YouTube video got 5.2x your average views. Strike while hot — create Part 2.', delivery_channel: 'in_app', sent_at: ago(3), read_at: null, metadata_json: { signal: 'viral_spike', platform: 'youtube' } },
  ])

  // ── 26. Stripe events (dedup log) ────────────────────────────────────────
  log('26. Stripe events')
  await upsert('stripe_events', [
    { stripe_event_id: `evt_seed_alice_checkout`,  event_type: 'checkout.session.completed', data: { object: { metadata: { user_id: alice.id, plan_code: 'PRO' } } }, processed: true },
    { stripe_event_id: `evt_seed_bob_checkout`,    event_type: 'checkout.session.completed', data: { object: { metadata: { user_id: bob.id,   plan_code: 'BASE' } } }, processed: true },
    { stripe_event_id: `evt_seed_carol_checkout`,  event_type: 'checkout.session.completed', data: { object: { metadata: { user_id: carol.id, plan_code: 'ELITE' } } }, processed: true },
    { stripe_event_id: `evt_seed_carol_invoice_1`, event_type: 'invoice.paid',               data: { object: { subscription: carolSubId } }, processed: true },
  ], 'stripe_event_id')

  // ── Core gamification table (if it exists — phase engine reads it) ───────
  log('27. Core gamification (for phase engine)')
  try {
    await upsert('core_gamification', [
      { project_id: aliceProjId, xp_total: 2200, level: 5,  streak_days: 18, energy: 80,  last_mission_date: daysDate(0), updated_at: new Date().toISOString() },
      { project_id: bobProjId,   xp_total: 50,   level: 1,  streak_days: 1,  energy: 100, last_mission_date: null, updated_at: new Date().toISOString() },
      { project_id: carolProjId, xp_total: 8500, level: 17, streak_days: 35, energy: 65,  last_mission_date: daysDate(0), updated_at: new Date().toISOString() },
    ], 'project_id')
    console.log('  ↳ core_gamification seeded')
  } catch (e) {
    console.log('  ↳ core_gamification table not found — skipping (gamification on projects table)')
  }

  // ── Done ───────────────────────────────────────────────────────────────
  console.log('\n✅ Seed complete!\n')
  console.log('Test accounts:')
  console.log('  alice@test.glimad.com  Seedpass123!  (F3, monetize, PRO)   — fully loaded')
  console.log('  bob@test.glimad.com    Seedpass123!  (F0, test, BASE)      — just started')
  console.log('  carol@test.glimad.com  Seedpass123!  (F5, scale, ELITE)    — power user')
}

main().catch(err => {
  console.error('\n❌ Seed failed:', err.message)
  process.exit(1)
})
