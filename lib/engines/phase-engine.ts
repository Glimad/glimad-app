// Phase Engine — computes F0-F7 phase from Brain state
// Pure function: reads data, returns result. Caller writes to Brain.

import { createAdminClient } from '@/lib/supabase/admin'
import { writeFact, appendSignal, createSnapshot, readAllFacts, readSignals, readLatestSignal } from '@/lib/brain'

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
  projectId: string,
  now: Date = new Date()
): Promise<PhaseResult> {
  // ── Fetch all inputs ──────────────────────────────────────────────────────
  const [facts, signals90d, latestMetrics] = await Promise.all([
    readAllFacts(admin, projectId),
    readSignals(admin, projectId, 90 * 24),
    admin
      .from('platform_metrics')
      .select('*')
      .eq('project_id', projectId)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single()
      .then(r => r.data ?? null),
  ])

  const nowMs = now.getTime()
  const signals30d = signals90d.filter(s => nowMs - new Date(s.observed_at).getTime() < 30 * 24 * 3600 * 1000)
  const signals7d = signals30d.filter(s => nowMs - new Date(s.observed_at).getTime() < 7 * 24 * 3600 * 1000)

  // ── Resolve metrics: platform_metrics preferred, Brain Facts as fallback ──
  const resolvedFollowers: number =
    latestMetrics?.followers_count ?? (facts['followers_total'] as number | null) ?? 0
  const resolvedAvgEr: number =
    latestMetrics?.avg_engagement_rate ?? (facts['avg_engagement_rate'] as number | null) ?? 0
  const resolvedPosts30d: number =
    latestMetrics?.recent_posts_7d != null
      ? latestMetrics.recent_posts_7d * 4   // extrapolate 7d → 30d
      : (facts['posts_last_30d'] as number | null)
        ?? signals30d.filter(s => s.signal_key === 'consistency.posts_published_30d')
              .map(s => (s.value as { value: number }).value ?? 0)
              .slice(-1)[0] ?? 0
  const resolvedAvgViews: number =
    latestMetrics?.avg_views ?? (facts['avg_views_last10'] as number | null) ?? 0
  const lastScrapeDate: Date | null = latestMetrics?.fetched_at ? new Date(latestMetrics.fetched_at) : null

  // ── Evidence gate ─────────────────────────────────────────────────────────
  const evidenceCount = signals30d.length
  const hasEvidence = evidenceCount >= 3

  // ── Technology dimension ──────────────────────────────────────────────────
  // Spec: handle provided=30, scrape completed=40, satellites configured=30
  const hasPlatform = !!facts['focus_platform']
  const hasHandle = !!facts['focus_platform_handle'] || !!facts['handle'] || !!latestMetrics?.handle
  const hasScrape = signals90d.some(s => s.signal_key === 'scrape_completed')
  const { data: satellitePlatforms } = await admin
    .from('projects_platforms')
    .select('id')
    .eq('project_id', projectId)
    .eq('role', 'satellite')
    .limit(1)
  const hasSatellites = (satellitePlatforms?.length ?? 0) > 0
  let technology = 0
  if (hasHandle) technology += 30
  if (hasScrape) technology += 40
  if (hasSatellites) technology += 30
  technology = clamp(technology)

  // ── Discovery dimension ───────────────────────────────────────────────────
  // niche_raw exists (user-defined)  → 20 pts
  // niche confirmed by AI (NICHE_CONFIRM_V1 completed, writes `niche` fact) → 30 pts
  // audience_persona defined → 30 pts
  // positioning_statement generated → 20 pts
  // Full score = 100
  const hasNicheRaw = !!facts['niche_raw']
  const hasNicheConfirmed = !!facts['niche']
    || signals90d.some(s => s.signal_key === 'mission_completed'
        && (s.value as { mission_type?: string })?.mission_type === 'NICHE_CONFIRM_V1')
  const hasPersona = !!facts['audience_persona']
  const hasPositioning = !!facts['positioning_statement']
  let discovery = 0
  if (hasNicheRaw) discovery += 20
  if (hasNicheConfirmed) discovery += 30
  if (hasPersona) discovery += 30
  if (hasPositioning) discovery += 20
  discovery = clamp(discovery)

  // ── Audience dimension ────────────────────────────────────────────────────
  // Linear interpolation within spec bands:
  // 0-1% → 0-25  |  1-2% → 25-50  |  2-4% → 50-75  |  4%+ → 75-100
  // +10 if audience persona defined
  const avgEr = resolvedAvgEr
  let audience: number
  if (avgEr <= 0) {
    audience = 0
  } else if (avgEr < 0.01) {
    audience = Math.round((avgEr / 0.01) * 25)                          // 0–25
  } else if (avgEr < 0.02) {
    audience = Math.round(25 + ((avgEr - 0.01) / 0.01) * 25)           // 25–50
  } else if (avgEr < 0.04) {
    audience = Math.round(50 + ((avgEr - 0.02) / 0.02) * 25)           // 50–75
  } else {
    audience = Math.round(Math.min(100, 75 + ((avgEr - 0.04) / 0.04) * 25)) // 75–100
  }
  if (hasPersona) audience = clamp(audience + 10)
  audience = clamp(audience)

  // ── Consistency dimension ─────────────────────────────────────────────────
  // Spec anchors: 0→0, 1→30, 3→70, 5+→100 — linear interpolation between
  const posts30d = resolvedPosts30d
  const avgPostsPerWeek = posts30d / 4
  let consistency: number
  if (avgPostsPerWeek >= 5) {
    consistency = 100
  } else if (avgPostsPerWeek >= 3) {
    consistency = Math.round(70 + ((avgPostsPerWeek - 3) / 2) * 30)  // 3→70, 5→100
  } else if (avgPostsPerWeek >= 1) {
    consistency = Math.round(30 + ((avgPostsPerWeek - 1) / 2) * 40)  // 1→30, 3→70
  } else {
    consistency = Math.round((avgPostsPerWeek / 1) * 30)              // 0→0, 1→30
  }

  // Penalize for consistency_gap signal in last 14 days
  // OR if last scrape shows 0 posts in 7d and scrape date is current (within 2 days)
  const hasConsistencyGap = signals30d.some(s => {
    const age = nowMs - new Date(s.observed_at).getTime()
    return s.signal_key === 'consistency_gap' && age < 14 * 24 * 3600 * 1000
  })
  const scrapeShowsNoRecent = lastScrapeDate !== null
    && (nowMs - lastScrapeDate.getTime()) < 2 * 24 * 3600 * 1000
    && (latestMetrics?.recent_posts_7d ?? 1) === 0
  if (hasConsistencyGap || scrapeShowsNoRecent) consistency = clamp(consistency - 20)
  consistency = clamp(consistency)

  // ── Engagement dimension ──────────────────────────────────────────────────
  // Base: absolute ER mapped through same bands as audience (0–100)
  // Trend: compare most-recent vs oldest signal in window — up to ±20 pts
  // Spec: "an improving engagement rate scores higher even if absolute rate is low"
  let erBase: number
  if (avgEr <= 0) {
    erBase = 0
  } else if (avgEr < 0.01) {
    erBase = Math.round((avgEr / 0.01) * 25)
  } else if (avgEr < 0.02) {
    erBase = Math.round(25 + ((avgEr - 0.01) / 0.01) * 25)
  } else if (avgEr < 0.04) {
    erBase = Math.round(50 + ((avgEr - 0.02) / 0.02) * 25)
  } else {
    erBase = Math.round(Math.min(100, 75 + ((avgEr - 0.04) / 0.04) * 25))
  }

  const erSignals = signals90d
    .filter(s => s.signal_key === 'engagement.avg_er_7d')
    .map(s => (s.value as { value: number }).value ?? 0)

  let trendBonus = 0
  if (erSignals.length >= 2) {
    const newest = erSignals[0]
    const oldest = erSignals[erSignals.length - 1]
    // Relative change so a small absolute ER that is improving still scores well
    const relativeTrend = oldest > 0 ? (newest - oldest) / oldest : 0
    // Cap trend bonus at ±20 pts
    trendBonus = Math.round(Math.max(-20, Math.min(20, relativeTrend * 100)))
  }

  const engagement = clamp(erBase + trendBonus)

  // ── Growth dimension ──────────────────────────────────────────────────────
  // Spec: use signals from last 30 days
  // Bands (linear interpolation): 0%→0, 0-1%→0-30, 1-5%→30-60, 5-10%→60-80, 10-20%→80-100
  // viral_spike signal in last 7 days → +10 bonus
  const followers = resolvedFollowers
  const followersSignals30d = signals30d
    .filter(s => s.signal_key === 'growth.followers_total')
    .map(s => (s.value as { value: number }).value ?? 0)

  let growth = 0
  if (followersSignals30d.length >= 2) {
    const oldest = followersSignals30d[followersSignals30d.length - 1]
    const newest = followersSignals30d[0]
    const growthPct = oldest > 0 ? (newest - oldest) / oldest : 0

    if (growthPct <= 0) {
      growth = 0
    } else if (growthPct < 0.01) {
      growth = Math.round((growthPct / 0.01) * 30)                          // 0→0, 1%→30
    } else if (growthPct < 0.05) {
      growth = Math.round(30 + ((growthPct - 0.01) / 0.04) * 30)           // 1%→30, 5%→60
    } else if (growthPct < 0.10) {
      growth = Math.round(60 + ((growthPct - 0.05) / 0.05) * 20)           // 5%→60, 10%→80
    } else {
      growth = Math.round(Math.min(100, 80 + ((growthPct - 0.10) / 0.10) * 20)) // 10%→80, 20%→100
    }
  } else if (followers > 0) {
    growth = 15 // some follower data exists but no 30d trend yet
  }

  // Check both scrape-written and inflexion-engine-written viral spike signals
  const hasViralSpike = signals7d.some(s =>
    s.signal_key === 'content_perf.viral_spike' || s.signal_key === 'viral_spike'
  )
  if (hasViralSpike) growth = clamp(growth + 10)
  growth = clamp(growth)

  // ── Monetization dimension ────────────────────────────────────────────────
  // Gate: requires followers >= 5K AND ER >= 3% to start scoring (0 in F0-F3)
  // Follower score (0-50): 5K→0, 10K→20, 50K→40, 100K+→50
  // ER score (0-30): 3%→0, 10%+→30 (linear)
  // monetization_ready signal → +20
  const offerDefined = facts['offer_defined'] === true  // used only by F4 gate
  let monetization = 0
  if (followers >= 5000 && avgEr >= 0.03) {
    const followerScore = followers >= 100000 ? 50
      : followers >= 50000 ? 40
      : followers >= 10000 ? Math.round(20 + ((followers - 10000) / 40000) * 20)  // 10K→20, 50K→40
      : Math.round(((followers - 5000) / 5000) * 20)                               // 5K→0, 10K→20

    const erScore = Math.round(Math.min(30, ((avgEr - 0.03) / 0.07) * 30))        // 3%→0, 10%→30

    monetization = followerScore + erScore
  }
  const hasMonetizationReady = signals90d.some(s => s.signal_key === 'monetization_ready')
  if (hasMonetizationReady) monetization = clamp(monetization + 20)
  monetization = clamp(monetization)

  // ── Team/Ops dimension ────────────────────────────────────────────────────
  // 4 Core Flow missions × 15 pts each = 60  |  batch_config = 20  |  calendar = 20
  // Mission completion detected via mission_completed signal with matching mission_type,
  // with fact-based fallback for missions that write known facts
  const coreFlowMissions = [
    'VISION_PURPOSE_MOODBOARD_V1',
    'NICHE_CONFIRM_V1',
    'PLATFORM_STRATEGY_PICKER_V1',
    'PREFERENCES_CAPTURE_V1',
  ] as const

  const completedCoreFlow = new Set(
    signals90d
      .filter(s => s.signal_key === 'mission_completed')
      .map(s => (s.value as { mission_type?: string })?.mission_type)
      .filter(Boolean)
  )

  // Fact-based fallbacks — each mission writes a canonical fact on completion
  if (!!facts['positioning_statement']) completedCoreFlow.add('VISION_PURPOSE_MOODBOARD_V1')
  if (!!facts['niche'])                 completedCoreFlow.add('NICHE_CONFIRM_V1')
  if (!!facts['focus_platform'])        completedCoreFlow.add('PLATFORM_STRATEGY_PICKER_V1')
  if (!!facts['on_camera_comfort'] !== undefined || !!facts['weekly_hours'])
                                        completedCoreFlow.add('PREFERENCES_CAPTURE_V1')

  const coreFlowScore = coreFlowMissions.filter(m => completedCoreFlow.has(m)).length * 15

  const hasBatchConfig = !!facts['batch_config']
  const hasCalendar = signals90d.some(s => s.signal_key === 'content_published')

  let teamOps = coreFlowScore
  if (hasBatchConfig) teamOps += 20
  if (hasCalendar) teamOps += 20
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
    has_niche: hasNicheRaw,
    niche_confirmed: hasNicheConfirmed,
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

  // Cooldown gate: if the user advanced a phase in the last 30 days, block further advancement
  // Only upward phase changes start the cooldown clock — regressions do not
  const lastPhaseChange = await readLatestSignal(admin, projectId, 'phase_changed')
  if (lastPhaseChange) {
    const sig = lastPhaseChange.value as { from?: string; to?: string }
    const phaseRanks = ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7']
    const wasAdvancement = sig.from && sig.to
      && phaseRanks.indexOf(sig.to) > phaseRanks.indexOf(sig.from)

    if (wasAdvancement) {
      const daysSinceAdvancement = (nowMs - new Date(lastPhaseChange.observed_at).getTime()) / (24 * 3600 * 1000)
      if (daysSinceAdvancement < 30) {
        const prevPhaseRun = await admin
          .from('core_phase_runs')
          .select('phase_code')
          .eq('project_id', projectId)
          .order('computed_at', { ascending: false })
          .limit(1)
          .single()

        if (prevPhaseRun.data) {
          const prevRank = phaseRanks.indexOf(prevPhaseRun.data.phase_code)
          const newRank = phaseRanks.indexOf(computedPhase)
          if (newRank > prevRank) {
            computedPhase = prevPhaseRun.data.phase_code as PhaseCode
            gates['cooldown_gate_applied'] = true
          }
        }
      }
    }
  }

  // ── Confidence ────────────────────────────────────────────────────────────
  let confidence = 0.5
  if (hasEvidence) confidence += 0.2
  if (hasScrape) confidence += 0.2
  if (completedCoreFlow.size >= 2) confidence += 0.1
  confidence = Math.min(1, confidence)

  // ── Reason summary ────────────────────────────────────────────────────────
  const reasonParts: string[] = []
  if (!hasNicheRaw) reasonParts.push('niche not defined')
  else if (!hasNicheConfirmed) reasonParts.push('niche not yet confirmed by AI')
  if (!hasEvidence) reasonParts.push(`only ${evidenceCount} signals (need 3+)`)
  if (!hasScrape) reasonParts.push('no scrape data yet')
  if (completedCoreFlow.size > 0) reasonParts.push(`${completedCoreFlow.size}/4 core flow missions completed`)
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
    const recentSignals = await readSignals(admin, projectId, 72)
    await createSnapshot(admin, projectId, 'phase_changed', { phase: result.phase, facts: allFacts, signals: recentSignals })
  }

  return result
}
