// Phase Engine — computes F0-F7 phase from Brain state
// Pure function: reads data, returns result. Caller writes to Brain.

import { createAdminClient } from '@/lib/supabase/admin'
import { readAllFacts, readSignals, readLatestSignal } from '@/lib/brain'

type AdminClient = ReturnType<typeof createAdminClient>

export type PhaseCode = 'F0' | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7'

export interface DimensionScores {
  discovery: number     // 15% — niche defined, missions done
  audience: number      // 10% — engagement rate
  consistency: number   // 15% — posting frequency, streaks
  engagement: number    // 20% — engagement rate trend
  growth: number        // 15% — follower growth
  monetization: number  // 10% — product/monetization signals
  teamOps: number       // 10% — missions completed, calendar
  technology: number    // 5%  — platform configured, scrape done
}

export interface PhaseResult {
  phase: PhaseCode
  capabilityScore: number
  dimensionScores: DimensionScores
  gates: Record<string, boolean>
  confidence: number
  reasonSummary: string
}

const WEIGHTS: Record<keyof DimensionScores, number> = {
  discovery: 0.15,
  audience: 0.10,
  consistency: 0.15,
  engagement: 0.20,
  growth: 0.15,
  monetization: 0.10,
  teamOps: 0.10,
  technology: 0.05,
}

const PHASE_THRESHOLDS: Array<{ min: number; phase: PhaseCode }> = [
  { min: 92, phase: 'F7' },
  { min: 84, phase: 'F6' },
  { min: 72, phase: 'F5' },
  { min: 60, phase: 'F4' },
  { min: 45, phase: 'F3' },
  { min: 30, phase: 'F2' },
  { min: 15, phase: 'F1' },
  { min: 0,  phase: 'F0' },
]

function phaseFromScore(score: number): PhaseCode {
  for (const { min, phase } of PHASE_THRESHOLDS) {
    if (score >= min) return phase
  }
  return 'F0'
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n))
}

export async function computePhase(
  admin: AdminClient,
  projectId: string
): Promise<PhaseResult> {
  const facts = await readAllFacts(admin, projectId)
  const signals90d = await readSignals(admin, projectId, 90 * 24)
  const signals30d = signals90d.filter(s => {
    const age = Date.now() - new Date(s.observed_at).getTime()
    return age < 30 * 24 * 3600 * 1000
  })
  const signals7d = signals30d.filter(s => {
    const age = Date.now() - new Date(s.observed_at).getTime()
    return age < 7 * 24 * 3600 * 1000
  })

  // ── Evidence gate ─────────────────────────────────────────────────────────
  const evidenceCount = signals30d.length
  const hasEvidence = evidenceCount >= 3

  // ── Technology dimension ──────────────────────────────────────────────────
  const hasPlatform = !!facts['focus_platform']
  const hasHandle = !!facts['focus_platform_handle'] || !!facts['handle']
  const hasScrape = signals90d.some(s => s.signal_key === 'scrape_completed')
  let technology = 0
  if (hasPlatform) technology += 30
  if (hasHandle) technology += 40
  if (hasScrape) technology += 30
  technology = clamp(technology)

  // ── Discovery dimension ───────────────────────────────────────────────────
  const hasNiche = !!facts['niche_raw'] || !!facts['niche']
  const hasGoal = !!facts['primary_goal']
  const hasPersona = !!facts['audience_persona']
  let discovery = 0
  if (hasNiche) discovery += 40
  if (hasGoal) discovery += 20
  if (hasPersona) discovery += 40
  discovery = clamp(discovery)

  // ── Audience dimension ────────────────────────────────────────────────────
  const avgEr = (facts['avg_engagement_rate'] as number | null) ?? 0
  let audience = 0
  if (avgEr >= 0.04) audience = 90
  else if (avgEr >= 0.02) audience = 60
  else if (avgEr >= 0.01) audience = 30
  else if (avgEr > 0) audience = 15
  if (hasPersona) audience = clamp(audience + 10)
  audience = clamp(audience)

  // ── Consistency dimension ─────────────────────────────────────────────────
  const posts30d = (facts['posts_last_30d'] as number | null)
    ?? signals30d.filter(s => s.signal_key === 'consistency.posts_published_30d')
       .map(s => (s.value as { value: number }).value ?? 0)
       .slice(-1)[0] ?? 0

  const avgPostsPerWeek = posts30d / 4
  let consistency = 0
  if (avgPostsPerWeek >= 5) consistency = 100
  else if (avgPostsPerWeek >= 3) consistency = 70
  else if (avgPostsPerWeek >= 1) consistency = 30
  else if (posts30d > 0) consistency = 10

  // Penalize for consistency_gap signal in last 14 days
  const hasConsistencyGap = signals30d.some(s => {
    const age = Date.now() - new Date(s.observed_at).getTime()
    return s.signal_key === 'consistency_gap' && age < 14 * 24 * 3600 * 1000
  })
  if (hasConsistencyGap) consistency = clamp(consistency - 20)
  consistency = clamp(consistency)

  // ── Engagement dimension ──────────────────────────────────────────────────
  const erSignals = signals90d
    .filter(s => s.signal_key === 'engagement.avg_er_7d')
    .map(s => (s.value as { value: number }).value ?? 0)
    .slice(0, 5)

  let engagement = audience // base = audience score
  if (erSignals.length >= 2) {
    // Trending up: add bonus
    const trend = erSignals[0] - erSignals[erSignals.length - 1]
    if (trend > 0) engagement = clamp(engagement + 15)
    else if (trend < -0.01) engagement = clamp(engagement - 10)
  }
  engagement = clamp(engagement)

  // ── Growth dimension ──────────────────────────────────────────────────────
  const followers = (facts['followers_total'] as number | null) ?? 0
  const followersSignals = signals90d
    .filter(s => s.signal_key === 'growth.followers_total')
    .map(s => (s.value as { value: number }).value ?? 0)

  let growth = 0
  if (followersSignals.length >= 2) {
    const oldest = followersSignals[followersSignals.length - 1]
    const newest = followersSignals[0]
    const growthPct = oldest > 0 ? (newest - oldest) / oldest : 0
    if (growthPct >= 0.10) growth = 90
    else if (growthPct >= 0.05) growth = 70
    else if (growthPct >= 0.01) growth = 40
    else if (growthPct > 0) growth = 20
  } else if (followers > 0) {
    growth = 15 // some data, no trend yet
  }

  const hasViralSpike = signals7d.some(s => s.signal_key === 'content_perf.viral_spike')
  if (hasViralSpike) growth = clamp(growth + 10)
  growth = clamp(growth)

  // ── Monetization dimension ────────────────────────────────────────────────
  const offerDefined = facts['offer_defined'] === true
  let monetization = 0
  if (followers >= 5000 && avgEr >= 0.03) monetization = 30
  if (offerDefined) monetization = clamp(monetization + 40)
  const hasMonetizationReady = signals90d.some(s => s.signal_key === 'monetization_ready')
  if (hasMonetizationReady) monetization = clamp(monetization + 20)
  monetization = clamp(monetization)

  // ── Team/Ops dimension ────────────────────────────────────────────────────
  const completedMissions = signals90d.filter(s => s.signal_key === 'mission_completed').length
  const hasCalendar = signals90d.some(s => s.signal_key === 'content_published')
  const hasBatchConfig = !!facts['batch_config']
  let teamOps = 0
  teamOps += Math.min(completedMissions * 10, 40)
  if (hasCalendar) teamOps += 20
  if (hasBatchConfig) teamOps += 20
  if (hasPlatform && hasHandle) teamOps += 20
  teamOps = clamp(teamOps)

  const dimensions: DimensionScores = {
    discovery,
    audience,
    consistency,
    engagement,
    growth,
    monetization,
    teamOps,
    technology,
  }

  // ── Capability score (weighted average) ───────────────────────────────────
  let capabilityScore = 0
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    capabilityScore += dimensions[key as keyof DimensionScores] * weight
  }
  capabilityScore = Math.round(capabilityScore)

  // ── Phase from score ──────────────────────────────────────────────────────
  let computedPhase = phaseFromScore(capabilityScore)

  // ── Evidence gate: cap at F1 if < 3 signals ──────────────────────────────
  if (!hasEvidence) {
    const phaseRank = ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7']
    const currentRank = phaseRank.indexOf(computedPhase)
    if (currentRank > 1) computedPhase = 'F1'
  }

  // ── Anti-fraud gates ──────────────────────────────────────────────────────
  const gates: Record<string, boolean> = {
    has_platform: hasPlatform,
    has_handle: hasHandle,
    has_niche: hasNiche,
    has_evidence: hasEvidence,
    offer_defined: offerDefined,
  }

  // Hard gate F4: needs offer defined
  if (computedPhase === 'F4' && !offerDefined) {
    computedPhase = 'F3'
    gates['f4_blocked_no_offer'] = true
  }

  // Viral gate: don't advance more than 1 phase if viral_spike in last 7 days
  if (hasViralSpike) {
    const prevPhaseRun = await admin
      .from('core_phase_runs')
      .select('phase_code')
      .eq('project_id', projectId)
      .order('computed_at', { ascending: false })
      .limit(1)
      .single()

    if (prevPhaseRun.data) {
      const prevPhaseRank = ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7'].indexOf(prevPhaseRun.data.phase_code)
      const newRank = ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7'].indexOf(computedPhase)
      if (newRank > prevPhaseRank + 1) {
        computedPhase = ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7'][prevPhaseRank + 1] as PhaseCode
        gates['viral_gate_applied'] = true
      }
    }
  }

  // Cooldown gate: don't advance if last phase change < 30 days
  const lastPhaseChange = await readLatestSignal(admin, projectId, 'phase_changed')
  if (lastPhaseChange) {
    const daysSinceChange = (Date.now() - new Date(lastPhaseChange.observed_at).getTime()) / (24 * 3600 * 1000)
    if (daysSinceChange < 30) {
      const prevPhaseRun = await admin
        .from('core_phase_runs')
        .select('phase_code')
        .eq('project_id', projectId)
        .order('computed_at', { ascending: false })
        .limit(1)
        .single()

      if (prevPhaseRun.data) {
        const prevRank = ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7'].indexOf(prevPhaseRun.data.phase_code)
        const newRank = ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7'].indexOf(computedPhase)
        if (newRank > prevRank) {
          computedPhase = prevPhaseRun.data.phase_code as PhaseCode
          gates['cooldown_gate_applied'] = true
        }
      }
    }
  }

  // ── Confidence ────────────────────────────────────────────────────────────
  let confidence = 0.5
  if (hasEvidence) confidence += 0.2
  if (hasScrape) confidence += 0.2
  if (completedMissions >= 2) confidence += 0.1
  confidence = Math.min(1, confidence)

  // ── Reason summary ────────────────────────────────────────────────────────
  const reasonParts: string[] = []
  if (!hasNiche) reasonParts.push('niche not defined')
  if (!hasEvidence) reasonParts.push(`only ${evidenceCount} signals (need 3+)`)
  if (!hasScrape) reasonParts.push('no scrape data yet')
  if (completedMissions > 0) reasonParts.push(`${completedMissions} missions completed`)
  if (gates['viral_gate_applied']) reasonParts.push('viral gate applied')
  if (gates['cooldown_gate_applied']) reasonParts.push('cooldown gate applied')
  if (gates['f4_blocked_no_offer']) reasonParts.push('F4 blocked: no offer defined')

  const reasonSummary = reasonParts.length > 0
    ? reasonParts.join('; ')
    : `score ${capabilityScore}/100, ${evidenceCount} signals`

  return {
    phase: computedPhase,
    capabilityScore,
    dimensionScores: dimensions,
    gates,
    confidence,
    reasonSummary,
  }
}

export async function runPhaseEngine(
  admin: AdminClient,
  projectId: string
): Promise<PhaseResult> {
  const result = await computePhase(admin, projectId)

  // Get previous phase from last run
  const { data: lastRun } = await admin
    .from('core_phase_runs')
    .select('phase_code')
    .eq('project_id', projectId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .single()

  const previousPhase = lastRun?.phase_code as PhaseCode | null

  // Persist phase run
  await admin.from('core_phase_runs').insert({
    project_id: projectId,
    phase_code: result.phase,
    capability_score: result.capabilityScore,
    dimension_scores: result.dimensionScores,
    gates_json: result.gates,
    confidence: result.confidence,
    reason_summary: result.reasonSummary,
  })

  // Write brain fact
  const { writeFact, appendSignal, createSnapshot, readAllFacts } = await import('@/lib/brain')
  await writeFact(admin, projectId, 'current_phase', result.phase, 'phase_engine')
  await writeFact(admin, projectId, 'phase_scores', result.dimensionScores, 'phase_engine')
  await writeFact(admin, projectId, 'capability_score', result.capabilityScore, 'phase_engine')

  // Update project phase
  await admin
    .from('projects')
    .update({ phase_code: result.phase, updated_at: new Date().toISOString() })
    .eq('id', projectId)

  // If phase changed, emit signal + snapshot
  if (previousPhase && previousPhase !== result.phase) {
    await appendSignal(admin, projectId, 'phase_changed', {
      from: previousPhase,
      to: result.phase,
      score: result.capabilityScore,
    }, 'phase_engine')

    const allFacts = await readAllFacts(admin, projectId)
    await createSnapshot(admin, projectId, 'phase_changed', result.phase, allFacts)
  }

  return result
}
