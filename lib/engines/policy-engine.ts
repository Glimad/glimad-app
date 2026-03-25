// Policy Engine — decides which mission to instantiate next
// Inputs: Phase result, Inflexion result, Wallet state, completed missions
// Output: ordered list of mission template codes with priority scores

import { createAdminClient } from '@/lib/supabase/admin'
import { readAllFacts, readSignals } from '@/lib/brain'
import type { PhaseCode, PhaseResult } from './phase-engine'
import type { InflexionResult } from './inflexion-engine'

type AdminClient = ReturnType<typeof createAdminClient>

// Core Flow gate — must complete these in order before anything else (F0)
const CORE_FLOW: string[] = [
  'VISION_PURPOSE_MOODBOARD_V1',
  'NICHE_CONFIRM_V1',
  'PLATFORM_STRATEGY_PICKER_V1',
  'PREFERENCES_CAPTURE_V1',
]

// Inflexion → mission mapping
const INFLEXION_MISSIONS: Record<string, string> = {
  viral_spike: 'CONTENT_BATCH_3D_V1',
  engagement_plateau: 'ENGAGEMENT_RESCUE_V1',
  burnout_risk: 'ENGAGEMENT_RESCUE_V1',
  monetization_ready: 'DEFINE_OFFER_V1',
}

// Phase → recommended missions
const PHASE_MISSIONS: Record<PhaseCode, string[]> = {
  F0: ['VISION_PURPOSE_MOODBOARD_V1', 'NICHE_CONFIRM_V1', 'PLATFORM_STRATEGY_PICKER_V1', 'PREFERENCES_CAPTURE_V1'],
  F1: ['CONTENT_BATCH_3D_V1', 'ENGAGEMENT_RESCUE_V1'],
  F2: ['CONTENT_BATCH_3D_V1', 'ENGAGEMENT_RESCUE_V1'],
  F3: ['CONTENT_BATCH_3D_V1', 'DEFINE_OFFER_V1'],
  F4: ['DEFINE_OFFER_V1', 'CONTENT_BATCH_3D_V1'],
  F5: ['DEFINE_OFFER_V1', 'CONTENT_BATCH_3D_V1'],
  F6: ['CONTENT_BATCH_3D_V1'],
  F7: ['CONTENT_BATCH_3D_V1'],
}

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
}

export async function runPolicyEngine(
  admin: AdminClient,
  projectId: string,
  phaseResult: PhaseResult,
  inflexion: InflexionResult | null
): Promise<PolicyResult> {
  const facts = await readAllFacts(admin, projectId)
  await readSignals(admin, projectId, 30 * 24) // reserved for future use

  // Get completed missions (last 30 days or ever)
  const { data: completedInstances } = await admin
    .from('mission_instances')
    .select('template_code, completed_at')
    .eq('project_id', projectId)
    .eq('status', 'completed')

  const completedCodes = new Set((completedInstances ?? []).map(i => i.template_code))

  // Get active (open) missions
  const { data: activeInstances } = await admin
    .from('mission_instances')
    .select('template_code, status')
    .eq('project_id', projectId)
    .in('status', ['queued', 'running', 'waiting_input'])

  const activeCodes = new Set((activeInstances ?? []).map(i => i.template_code))

  // ── Determine active mode ───────────────────────────────────────────────
  let activeMode: 'test' | 'scale' | 'monetize' = 'test'

  if (inflexion?.type === 'viral_spike') {
    activeMode = 'scale'
  } else if (inflexion?.type === 'monetization_ready' || facts['offer_defined']) {
    activeMode = 'monetize'
  } else if (['F3', 'F4', 'F5', 'F6', 'F7'].includes(phaseResult.phase)) {
    const hasWinnerFormat = !!facts['winner_format']
    activeMode = hasWinnerFormat ? 'scale' : 'test'
  } else {
    activeMode = 'test'
  }

  // ── Core Flow Gate (F0 users) ──────────────────────────────────────────
  const isF0 = phaseResult.phase === 'F0'
  if (isF0) {
    // Find next incomplete Core Flow mission
    for (const templateCode of CORE_FLOW) {
      if (!completedCodes.has(templateCode)) {
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
    .select('template_code, type, phase_min, phase_max, cooldown_hours, credit_cost_allowance, credit_cost_premium')
    .eq('active', true)

  const phaseRank: Record<PhaseCode, number> = { F0: 0, F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7 }
  const currentRank = phaseRank[phaseResult.phase]

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
    if (completedCodes.has(code)) {
      const lastCompleted = completedInstances?.find(i => i.template_code === code)?.completed_at
      if (lastCompleted && template.cooldown_hours > 0) {
        const hoursAgo = (Date.now() - new Date(lastCompleted).getTime()) / 3600000
        if (hoursAgo < template.cooldown_hours) continue
      }
    }

    let score = 20 // base score

    // Inflexion bonus
    if (inflexion && INFLEXION_MISSIONS[inflexion.type] === code) score += 50

    // Phase recommendation bonus
    if (PHASE_MISSIONS[phaseResult.phase]?.includes(code)) score += 30

    // Never completed bonus
    if (!completedCodes.has(code)) score += 20

    // Credit penalty (if no premium credits and mission needs them)
    // (We don't check balance here — just score lower)

    const reason = [
      inflexion && INFLEXION_MISSIONS[inflexion.type] === code ? `inflexion:${inflexion.type}` : null,
      PHASE_MISSIONS[phaseResult.phase]?.includes(code) ? `phase:${phaseResult.phase}` : null,
      !completedCodes.has(code) ? 'new' : null,
    ].filter(Boolean).join(', ') || 'available'

    scored.push({ templateCode: code, priorityScore: score, reason })
  }

  scored.sort((a, b) => b.priorityScore - a.priorityScore)

  const topMission = scored[0]?.templateCode ?? null
  const rationale = topMission
    ? `Phase ${phaseResult.phase} (score ${phaseResult.capabilityScore}), mode: ${activeMode}, top mission: ${topMission}`
    : `Phase ${phaseResult.phase}, no missions available`

  // Save policy run (non-critical)
  void admin.from('core_policy_runs').insert({
    project_id: projectId,
    input_ref: { phase: phaseResult.phase, inflexion: inflexion?.type ?? null },
    output_json: { active_mode: activeMode, top_mission: topMission, queue: scored.slice(0, 5), rationale },
  })

  return {
    topMission,
    missionQueue: scored,
    activeMode,
    rationale,
  }
}
