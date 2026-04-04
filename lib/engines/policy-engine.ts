// Policy Engine — decides which mission to instantiate next
// Inputs: Phase result, Inflexion result, Wallet state, completed missions
// Output: ordered list of mission template codes with priority scores

import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'
import { readAllFacts, readSignals } from '@/lib/brain'
import type { PhaseCode, PhaseResult } from './phase-engine'
import type { InflexionResult } from './inflexion-engine'

type AdminClient = ReturnType<typeof createAdminClient>

// Core Flow gate — must complete these in order before anything else (F0)
// Order is canonical per implementation plan Step 10
const CORE_FLOW: string[] = [
  'VISION_PURPOSE_MOODBOARD_V1',
  'CONTENT_COMFORT_STYLE_V1',
  'PLATFORM_STRATEGY_PICKER_V1',
  'NICHE_CONFIRM_V1',
  'PREFERENCES_CAPTURE_V1',
]

// Inflexion → mission mapping
const INFLEXION_MISSIONS: Record<string, string> = {
  viral_spike: 'CONTENT_BATCH_3D_V1',
  engagement_plateau: 'ENGAGEMENT_RESCUE_V1',
  burnout_risk: 'ENGAGEMENT_RESCUE_V1',
  monetization_ready: 'DEFINE_OFFER_V1',
  crisis: 'ENGAGEMENT_RESCUE_V1',
}

// Phase → recommended missions
const PHASE_MISSIONS: Record<PhaseCode, string[]> = {
  F0: ['VISION_PURPOSE_MOODBOARD_V1', 'CONTENT_COMFORT_STYLE_V1', 'NICHE_CONFIRM_V1', 'PLATFORM_STRATEGY_PICKER_V1', 'PREFERENCES_CAPTURE_V1'],
  F1: ['AUDIENCE_PERSONA_V1', 'BATCH_CONFIG_V1', 'BRAND_KIT_LITE_V1', 'CONTENT_BATCH_3D_V1'],
  F2: ['CONTENT_BATCH_3D_V1', 'BRAND_KIT_LITE_V1', 'ENGAGEMENT_RESCUE_V1'],
  F3: ['CONTENT_BATCH_3D_V1', 'DEFINE_OFFER_V1'],
  F4: ['DEFINE_OFFER_V1', 'CONTENT_BATCH_3D_V1'],
  F5: ['DEFINE_OFFER_V1', 'CONTENT_BATCH_3D_V1'],
  F6: ['CONTENT_BATCH_3D_V1'],
  F7: ['CONTENT_BATCH_3D_V1'],
}

// P0=100, P1=80, P2=60, P3=40, P4=20, P5=10
const PRIORITY_BASE: Record<number, number> = { 0: 100, 1: 80, 2: 60, 3: 40, 4: 20, 5: 10 }

export interface MissionPriority {
  templateCode: string
  priorityScore: number
  reason: string
}

export interface PolicyResult {
  topMission: string | null
  missionQueue: MissionPriority[]
  activeMode: 'test' | 'scale' | 'monetize'
  rationale: string
  dailyCallsUsed?: number
  dailyCallsLimit?: number
}

export async function runPolicyEngine(
  admin: AdminClient,
  projectId: string,
  phaseResult: PhaseResult,
  inflexion: InflexionResult | null,
  force = false
): Promise<PolicyResult & { cached?: boolean }> {
  // ── Recalculation guardrail (same rules as Phase Engine) ──────────────────
  const inputHashRaw = createHash('sha256')
    .update(JSON.stringify({ phase: phaseResult.phase, score: phaseResult.capabilityScore, inflexion: inflexion?.type ?? null, projectId }))
    .digest('hex')

  const { data: lastPolicyRun } = await admin
    .from('core_policy_runs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (lastPolicyRun && !force) {
    const ageMinutes = (Date.now() - new Date(lastPolicyRun.created_at).getTime()) / 60000
    if (ageMinutes < 5) {
      const cached = lastPolicyRun.output_json as PolicyResult
      return { ...cached, cached: true }
    }
    if (ageMinutes < 60 && lastPolicyRun.input_hash === inputHashRaw) {
      const cached = lastPolicyRun.output_json as PolicyResult
      return { ...cached, cached: true }
    }
  }

  const facts = await readAllFacts(admin, projectId)
  const signals30d = await readSignals(admin, projectId, 30 * 24)

  // Get wallet state + plan daily limit
  const { data: wallet } = await admin
    .from('core_wallets')
    .select('allowance_llm_balance, premium_credits_balance, plan_code')
    .eq('project_id', projectId)
    .single()

  const premiumBalance = wallet?.premium_credits_balance ?? 0
  const planCode = wallet?.plan_code ?? 'BASE'

  // Get plan's daily LLM call limit
  const { data: plan } = await admin
    .from('core_plans')
    .select('daily_llm_limit')
    .eq('plan_code', planCode)
    .single()
  const dailyLlmLimit = plan?.daily_llm_limit ?? 50

  // Count today's allowance debits from core_ledger
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const { count: dailyUsed } = await admin
    .from('core_ledger')
    .select('ledger_id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('kind', 'debit')
    .gt('amount_allowance', 0)
    .gte('created_at', todayStart.toISOString())

  const dailyLimitReached = (dailyUsed ?? 0) >= dailyLlmLimit

  // burnout_risk signal check
  const hasBurnoutRisk = signals30d.some(s => s.signal_key === 'consistency_gap' || s.signal_key === 'burnout_risk')

  // Get completed missions
  const { data: completedInstances } = await admin
    .from('mission_instances')
    .select('template_code, completed_at')
    .eq('project_id', projectId)
    .eq('status', 'completed')

  const completedMap = new Map<string, string>() // code → last completed_at
  for (const inst of completedInstances ?? []) {
    const existing = completedMap.get(inst.template_code)
    if (!existing || inst.completed_at > existing) {
      completedMap.set(inst.template_code, inst.completed_at)
    }
  }

  // Get active (open) missions
  const { data: activeInstances } = await admin
    .from('mission_instances')
    .select('template_code, status')
    .eq('project_id', projectId)
    .in('status', ['queued', 'running', 'needs_user_input'])

  const activeCodes = new Set((activeInstances ?? []).map(i => i.template_code))

  // ── Determine active mode ───────────────────────────────────────────────
  // Per spec: viral_spike→scale | F4+→monetize | monetization_ready→monetize
  //           F3+ with winner_format→scale | plateau→test | default by phase
  let activeMode: 'test' | 'scale' | 'monetize' = 'test'

  const hasWinnerFormat = !!(facts['content.winner_format'] as { confidence?: number } | null | undefined)
    && ((facts['content.winner_format'] as { confidence?: number })?.confidence ?? 0) >= 0.8
  const offerDefined = !!(facts['offer_title'] ?? facts['offer_defined'])
  const isF4Plus = ['F4', 'F5', 'F6', 'F7'].includes(phaseResult.phase)
  const isF3Plus = ['F3', 'F4', 'F5', 'F6', 'F7'].includes(phaseResult.phase)
  const hasEngagementPlateau = inflexion?.type === 'engagement_plateau'
    || signals30d.some(s => s.signal_key === 'inflexion_detected'
      && (s.value as { type?: string })?.type === 'engagement_plateau')

  if (inflexion?.type === 'viral_spike') {
    activeMode = 'scale'
  } else if (isF4Plus || inflexion?.type === 'monetization_ready' || offerDefined) {
    activeMode = 'monetize'
  } else if (isF3Plus && hasWinnerFormat && !hasEngagementPlateau) {
    activeMode = 'scale'
  } else if (hasEngagementPlateau || !hasWinnerFormat || !isF3Plus) {
    activeMode = 'test'
  } else {
    activeMode = isF3Plus ? 'scale' : 'test'
  }

  // ── Core Flow Gate (F0 users) ──────────────────────────────────────────
  const isF0 = phaseResult.phase === 'F0'
  if (isF0) {
    for (const templateCode of CORE_FLOW) {
      if (!completedMap.has(templateCode)) {
        const isActive = activeCodes.has(templateCode)
        return {
          topMission: templateCode,
          missionQueue: [{
            templateCode,
            priorityScore: 100,
            reason: 'Core Flow mission required for F0',
          }],
          activeMode,
          rationale: `F0 Core Flow: next required mission is ${templateCode}${isActive ? ' (already active)' : ''}`,
        }
      }
    }
  }

  // ── Score available missions ───────────────────────────────────────────
  const { data: allTemplates } = await admin
    .from('mission_templates')
    .select('template_code, type, phase_min, phase_max, cooldown_hours, credit_cost_allowance, credit_cost_premium, priority_class')
    .eq('active', true)

  const phaseRank: Record<PhaseCode, number> = { F0: 0, F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7 }
  const currentRank = phaseRank[phaseResult.phase]
  const now = Date.now()

  const scored: MissionPriority[] = []

  for (const template of allTemplates ?? []) {
    const code = template.template_code

    // Skip Core Flow missions (already handled above)
    if (CORE_FLOW.includes(code)) continue

    // Skip if already active
    if (activeCodes.has(code)) continue

    // Phase gate
    const minRank = template.phase_min ? phaseRank[template.phase_min as PhaseCode] : 0
    const maxRank = template.phase_max ? phaseRank[template.phase_max as PhaseCode] : 7
    if (currentRank < minRank || currentRank > maxRank) continue

    // Cooldown check
    const lastCompletedAt = completedMap.get(code)
    if (lastCompletedAt && template.cooldown_hours > 0) {
      const hoursAgo = (now - new Date(lastCompletedAt).getTime()) / 3600000
      if (hoursAgo < template.cooldown_hours) continue
    }

    // Filter: premium missions require > 0 premium credits
    const isPremium = template.credit_cost_premium > 0
    if (isPremium && premiumBalance <= 0) continue

    // Base score from priority class
    const priorityClass = template.priority_class ?? 2
    let score = PRIORITY_BASE[priorityClass] ?? 20

    // Inflexion bonus
    if (inflexion && INFLEXION_MISSIONS[inflexion.type] === code) score += 50

    // Phase recommendation bonus
    if (PHASE_MISSIONS[phaseResult.phase]?.includes(code)) score += 30

    // Never completed bonus
    if (!completedMap.has(code)) score += 20

    // Completed > 30 days ago bonus
    if (lastCompletedAt) {
      const daysAgo = (now - new Date(lastCompletedAt).getTime()) / 86400000
      if (daysAgo > 30) score += 10
    }

    // burnout_risk penalty: high-energy missions (cost > 10 allowance) −30
    if (hasBurnoutRisk && template.credit_cost_allowance > 10) score -= 30

    // Low wallet credits penalty: if premium balance < 50, premium missions −40
    if (isPremium && premiumBalance < 50) score -= 40

    // Daily LLM limit reached: all LLM missions → 0
    if (dailyLimitReached && template.credit_cost_allowance > 0) score = 0

    const reasons: string[] = []
    if (inflexion && INFLEXION_MISSIONS[inflexion.type] === code) reasons.push(`inflexion:${inflexion.type}`)
    if (PHASE_MISSIONS[phaseResult.phase]?.includes(code)) reasons.push(`phase:${phaseResult.phase}`)
    if (!completedMap.has(code)) reasons.push('new')
    if (hasBurnoutRisk && template.credit_cost_allowance > 10) reasons.push('burnout_penalized')
    if (dailyLimitReached) reasons.push('daily_limit')

    scored.push({ templateCode: code, priorityScore: score, reason: reasons.join(', ') || 'available' })
  }

  scored.sort((a, b) => b.priorityScore - a.priorityScore)

  const topMission = scored[0]?.templateCode ?? null
  const rationale = topMission
    ? `Phase ${phaseResult.phase} (score ${phaseResult.capabilityScore}), mode: ${activeMode}, top mission: ${topMission}`
    : `Phase ${phaseResult.phase}, no missions available`

  const policyOutput = { active_mode: activeMode, top_mission: topMission, queue: scored.slice(0, 5), rationale, dailyCallsUsed: dailyUsed ?? 0, dailyCallsLimit: dailyLlmLimit }
  // Save policy run (non-critical)
  void admin.from('core_policy_runs').insert({
    project_id: projectId,
    input_ref: { phase: phaseResult.phase, inflexion: inflexion?.type ?? null },
    output_json: policyOutput,
    input_hash: inputHashRaw,
  })

  return {
    topMission,
    missionQueue: scored,
    activeMode,
    rationale,
    dailyCallsUsed: dailyUsed ?? 0,
    dailyCallsLimit: dailyLlmLimit,
  }
}
