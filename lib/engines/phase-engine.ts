// Phase Engine — computes F0-F7 phase from Brain state
// Pure function: reads data, returns result. Caller writes to Brain.

import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'
import { writeFact, appendSignal, createSnapshot, readAllFacts, readSignals, readLatestSignal } from '@/lib/brain'

type AdminClient = ReturnType<typeof createAdminClient>

export type PhaseCode = 'F0' | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7'

export interface DimensionScores {
  execution: number      // 40% — posts published, streak_days, calendar items scheduled
  audienceSignal: number // 25% — avg_engagement_rate, comment reply signals, saves signals
  clarity: number        // 20% — identity.niche defined, content.winner_format confidence, identity.north_star
  readiness: number      // 15% — calendar scheduled items, DM backlog, Core Flow missions completed
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
  execution: 0.40,
  audienceSignal: 0.25,
  clarity: 0.20,
  readiness: 0.15,
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
  const nowMs = now.getTime()

  // ── Fetch all inputs in parallel ─────────────────────────────────────────
  const [facts, signals90d, latestMetrics, gamification, calendarResult, monetizationProductsResult, monetizationEventsResult] = await Promise.all([
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
    admin
      .from('core_gamification')
      .select('streak_days, energy')
      .eq('project_id', projectId)
      .single()
      .then(r => r.data ?? null),
    admin
      .from('core_calendar_items')
      .select('id, state', { count: 'exact' })
      .eq('project_id', projectId)
      .in('state', ['scheduled', 'published'])
      .limit(100),
    admin
      .from('monetization_products')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .neq('status', 'archived'),
    admin
      .from('monetization_events')
      .select('event_type, amount, event_date')
      .eq('project_id', projectId)
      .order('event_date', { ascending: false })
      .limit(200),
  ])

  const signals30d = signals90d.filter(s => nowMs - new Date(s.observed_at).getTime() < 30 * 24 * 3600 * 1000)
  const signals7d = signals30d.filter(s => nowMs - new Date(s.observed_at).getTime() < 7 * 24 * 3600 * 1000)

  // ── Resolve core metrics ──────────────────────────────────────────────────
  const resolvedAvgEr: number =
    latestMetrics?.avg_engagement_rate ?? (facts['avg_engagement_rate'] as number | null) ?? 0
  const resolvedPosts30d: number =
    latestMetrics?.recent_posts_7d != null
      ? latestMetrics.recent_posts_7d * 4
      : (facts['posts_last_30d'] as number | null)
        ?? signals30d.filter(s => s.signal_key === 'consistency.posts_published_30d')
              .map(s => (s.value as { value: number }).value ?? 0)
              .slice(-1)[0] ?? 0
  const streakDays: number =
    gamification?.streak_days ?? (facts['streak_days'] as number | null) ?? 0
  const scheduledCalendarItems = (calendarResult.data ?? []).filter(i => i.state === 'scheduled').length
  const publishedCalendarItems = (calendarResult.data ?? []).filter(i => i.state === 'published').length

  const monetizationProductsCount = monetizationProductsResult.count ?? 0
  const monetizationEvents = monetizationEventsResult.data ?? []

  const hasScrape = signals90d.some(s => s.signal_key === 'scrape_completed')

  // ── Evidence gate ─────────────────────────────────────────────────────────
  const EVIDENCE_SIGNAL_KEYS = new Set([
    'scrape_completed', 'mission_completed', 'growth.followers_total',
    'engagement.avg_er_7d', 'consistency.posts_published_7d', 'consistency.posts_published_30d',
    'content_perf.viral_spike', 'viral_spike', 'content_published', 'inflexion_detected',
    'phase_changed', 'data_correction',
  ])
  const evidenceCount = signals30d.filter(s => EVIDENCE_SIGNAL_KEYS.has(s.signal_key)).length
  const hasEvidence = evidenceCount >= 3

  // ── Viral spike ───────────────────────────────────────────────────────────
  const hasViralSpike = signals7d.some(s =>
    s.signal_key === 'content_perf.viral_spike' || s.signal_key === 'viral_spike'
  )

  // ── Core Flow missions (5 canonical) ─────────────────────────────────────
  const CORE_FLOW_MISSIONS = [
    'VISION_PURPOSE_MOODBOARD_V1',
    'CONTENT_COMFORT_STYLE_V1',
    'PLATFORM_STRATEGY_PICKER_V1',
    'NICHE_CONFIRM_V1',
    'PREFERENCES_CAPTURE_V1',
  ] as const

  const completedCoreFlow = new Set(
    signals90d
      .filter(s => s.signal_key === 'mission_completed')
      .map(s => (s.value as { mission_type?: string })?.mission_type)
      .filter(Boolean)
  )
  // Fact-based fallbacks — each mission writes a canonical fact on completion
  const focusPlatformFact = facts['platforms.focus'] ?? facts['focus_platform']
  const nicheFact = facts['identity.niche'] ?? facts['niche']
  const northStarFact = facts['identity.north_star'] ?? facts['north_star']
  const positioningFact = facts['positioning_statement']
  const onCameraFact = facts['capabilities.on_camera_comfort'] ?? facts['on_camera_comfort']
  const weeklyHoursFact = facts['capabilities.weekly_hours_available'] ?? facts['weekly_hours']
  const contentStyleFact = facts['content.style'] ?? facts['content_style']

  if (positioningFact || northStarFact)   completedCoreFlow.add('VISION_PURPOSE_MOODBOARD_V1')
  if (contentStyleFact)                   completedCoreFlow.add('CONTENT_COMFORT_STYLE_V1')
  if (focusPlatformFact)                  completedCoreFlow.add('PLATFORM_STRATEGY_PICKER_V1')
  if (nicheFact)                          completedCoreFlow.add('NICHE_CONFIRM_V1')
  if (onCameraFact != null || weeklyHoursFact != null) completedCoreFlow.add('PREFERENCES_CAPTURE_V1')

  const coreFlowCompleted = CORE_FLOW_MISSIONS.filter(m => completedCoreFlow.has(m)).length

  // ── DIMENSION: Execution (40%) ────────────────────────────────────────────
  // Sub-scores: posts_30d (40%), streak_days (35%), calendar items (25%)
  const avgPostsPerWeek = resolvedPosts30d / 4
  let postsScore: number
  if (avgPostsPerWeek >= 5) {
    postsScore = 100
  } else if (avgPostsPerWeek >= 3) {
    postsScore = Math.round(70 + ((avgPostsPerWeek - 3) / 2) * 30)
  } else if (avgPostsPerWeek >= 1) {
    postsScore = Math.round(30 + ((avgPostsPerWeek - 1) / 2) * 40)
  } else {
    postsScore = Math.round((avgPostsPerWeek / 1) * 30)
  }

  let streakScore: number
  if (streakDays >= 30) {
    streakScore = 100
  } else if (streakDays >= 14) {
    streakScore = Math.round(60 + ((streakDays - 14) / 16) * 40)
  } else if (streakDays >= 7) {
    streakScore = Math.round(30 + ((streakDays - 7) / 7) * 30)
  } else {
    streakScore = Math.round((streakDays / 7) * 30)
  }

  const totalCalendarItems = scheduledCalendarItems + publishedCalendarItems
  let calendarScore: number
  if (totalCalendarItems >= 7) {
    calendarScore = 100
  } else if (totalCalendarItems >= 3) {
    calendarScore = Math.round(60 + ((totalCalendarItems - 3) / 4) * 40)
  } else if (totalCalendarItems >= 1) {
    calendarScore = Math.round(30 + ((totalCalendarItems - 1) / 2) * 30)
  } else {
    calendarScore = 0
  }

  const execution = clamp(Math.round(postsScore * 0.40 + streakScore * 0.35 + calendarScore * 0.25))

  // ── DIMENSION: Audience Signal (25%) ──────────────────────────────────────
  // ER score (0-70): bands 0-1%→0-25, 1-2%→25-50, 2-4%→50-65, 4%+→65-70
  // Reply rate bonus (0-20): if reply_rate signal > 50%
  // Saves signal bonus (0-10): if saves signals exist
  const avgEr = resolvedAvgEr
  let erScore: number
  if (avgEr <= 0) {
    erScore = 0
  } else if (avgEr < 0.01) {
    erScore = Math.round((avgEr / 0.01) * 25)
  } else if (avgEr < 0.02) {
    erScore = Math.round(25 + ((avgEr - 0.01) / 0.01) * 25)
  } else if (avgEr < 0.04) {
    erScore = Math.round(50 + ((avgEr - 0.02) / 0.02) * 15)
  } else {
    erScore = Math.round(Math.min(70, 65 + ((avgEr - 0.04) / 0.04) * 5))
  }

  const replyRateSignals = signals90d.filter(s => s.signal_key === 'engagement.reply_rate')
  const latestReplyRate = replyRateSignals.length > 0
    ? ((replyRateSignals[0].value as { value?: number })?.value ?? 0)
    : 0
  const replyBonus = latestReplyRate > 0.5 ? 20 : Math.round(latestReplyRate / 0.5 * 10)

  const hasSavesSignal = signals90d.some(s => s.signal_key === 'engagement.saves' || s.signal_key === 'content_perf.saves')
  const savesBonus = hasSavesSignal ? 10 : 0

  const audienceSignal = clamp(erScore + replyBonus + savesBonus)

  // ── DIMENSION: Clarity (20%) ──────────────────────────────────────────────
  // identity.niche defined: +30
  // content.winner_format with confidence ≥ 0.8: +40
  // identity.north_star defined: +30
  const hasNiche = !!nicheFact
  const winnerFormat = facts['content.winner_format'] as { confidence?: number } | null | undefined
  const hasWinnerFormat = !!winnerFormat && (winnerFormat.confidence ?? 0) >= 0.8
  const hasNorthStar = !!northStarFact

  let clarity = 0
  if (hasNiche)        clarity += 30
  if (hasWinnerFormat) clarity += 40
  if (hasNorthStar)    clarity += 30
  clarity = clamp(clarity)

  // ── DIMENSION: Readiness (15%) ────────────────────────────────────────────
  // Calendar has scheduled items: +30
  // DM backlog < threshold (no dm_backlog_high signal in last 30d): +30
  // Core Flow missions completed (5 × 8 pts each = 40): up to 40
  const hasDmBacklogHigh = signals30d.some(s => s.signal_key === 'dm_backlog_high')
  const dmBacklogOk = !hasDmBacklogHigh

  let readiness = 0
  if (scheduledCalendarItems >= 1) readiness += 30
  if (dmBacklogOk)                 readiness += 30
  readiness += coreFlowCompleted * 8  // 5 missions × 8 pts = 40 max
  readiness = clamp(readiness)

  const dimensions: DimensionScores = {
    execution,
    audienceSignal,
    clarity,
    readiness,
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
    const phaseRankArr = ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7']
    if (phaseRankArr.indexOf(computedPhase) > 1) computedPhase = 'F1'
  }

  // ── Hard gates per phase (ALL must pass to stay at target phase) ──────────
  const PHASE_RANKS = ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7']
  const gates: Record<string, boolean> = { has_evidence: hasEvidence }

  // F1 gates: platforms.focus defined, bio created, ≥1 calendar item scheduled
  const hasFocusPlatform = !!focusPlatformFact
  const hasBio = !!(facts['bio'] ?? facts['platform_bio'] ?? latestMetrics?.handle)
  gates['f1_focus_platform'] = hasFocusPlatform
  gates['f1_bio_created'] = hasBio
  gates['f1_calendar_item'] = scheduledCalendarItems >= 1 || publishedCalendarItems >= 1

  // F2 gates: ≥5 real publications, ≥1 format tested in series (3+ same-type pieces)
  const totalPublications = (latestMetrics?.posts_count ?? 0) + publishedCalendarItems
  const hasSeriesFormat = signals90d.some(s => s.signal_key === 'content_perf.series_detected'
    || (s.signal_key === 'mission_completed' && (s.value as { series?: boolean })?.series === true))
    || publishedCalendarItems >= 3
  gates['f2_min_publications'] = totalPublications >= 5
  gates['f2_series_format'] = hasSeriesFormat

  // F3 gates: streak ≥14 days, avg_engagement_rate ≥2.5% (30d), reply_rate >50%, winner_format.confidence ≥ 0.8
  gates['f3_streak_14'] = streakDays >= 14
  gates['f3_er_2_5pct'] = avgEr >= 0.025
  gates['f3_reply_rate_50pct'] = latestReplyRate > 0.5
  gates['f3_winner_format'] = hasWinnerFormat

  // F4 gates: monetization_products count ≥1 OR offer_defined, AND demand signals
  const offerDefined = !!(facts['offer_title'] ?? facts['offer_defined'])
  const hasDemandSignals =
    monetizationEvents.some(e => e.event_type === 'sale') ||
    signals90d.filter(s => s.signal_key === 'demand.dm_inquiry').length >= 5 ||
    signals90d.filter(s => s.signal_key === 'demand.link_click').length >= 50
  gates['f4_offer_or_product'] = monetizationProductsCount >= 1 || offerDefined
  gates['f4_demand_signals'] = hasDemandSignals

  // F5 gates: media_kit defined, ≥5 completed content batches, ≥1 collaboration signal
  const hasMediaKit = !!(facts['media_kit'] ?? facts['media_kit_url'])
  const completedBatchCount = signals90d.filter(s => s.signal_key === 'batch_completed').length
  const hasCollabSignal = signals90d.some(s => s.signal_key === 'collaboration_completed' || s.signal_key === 'collaboration_signal')
  gates['f5_media_kit'] = hasMediaKit
  gates['f5_content_batches'] = completedBatchCount >= 5
  gates['f5_collaboration'] = hasCollabSignal

  // F6 gates: ≥2 platforms active, ≥10 repurposed items/month
  const { data: activePlatforms } = await admin
    .from('projects_platforms')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'active')
  const activePlatformCount = (activePlatforms?.length ?? 0) + (hasFocusPlatform ? 1 : 0)
  const repurposedThisMonth = signals30d.filter(s => s.signal_key === 'content_repurposed').length
  gates['f6_multi_platform'] = activePlatformCount >= 2
  gates['f6_repurposed_items'] = repurposedThisMonth >= 10

  // F7 gates: SOPs defined, revenue ≥€5K/month, demand-driven signals
  const hasSOPs = !!(facts['sops_defined'] ?? facts['operations_sops'])
  const revenueThisMonth = monetizationEvents
    .filter(e => {
      const age = nowMs - new Date(e.event_date).getTime()
      return e.event_type === 'sale' && age < 30 * 24 * 3600 * 1000
    })
    .reduce((s, e) => s + Number(e.amount), 0)
  const hasDemandDriven = signals30d.some(s => s.signal_key === 'demand_driven_signal' || s.signal_key === 'demand.high_intent')
  gates['f7_sops'] = hasSOPs
  gates['f7_revenue_5k'] = revenueThisMonth >= 5000
  gates['f7_demand_driven'] = hasDemandDriven

  // Apply hard gates: if target phase gates fail → drop to previous phase
  const phaseGateMap: Record<string, string[]> = {
    F1: ['f1_focus_platform', 'f1_bio_created', 'f1_calendar_item'],
    F2: ['f2_min_publications', 'f2_series_format'],
    F3: ['f3_streak_14', 'f3_er_2_5pct', 'f3_reply_rate_50pct', 'f3_winner_format'],
    F4: ['f4_offer_or_product', 'f4_demand_signals'],
    F5: ['f5_media_kit', 'f5_content_batches', 'f5_collaboration'],
    F6: ['f6_multi_platform', 'f6_repurposed_items'],
    F7: ['f7_sops', 'f7_revenue_5k', 'f7_demand_driven'],
  }

  // Walk from computed phase downward until all gates pass
  let rank = PHASE_RANKS.indexOf(computedPhase)
  while (rank > 0) {
    const targetPhase = PHASE_RANKS[rank]
    const gateKeys = phaseGateMap[targetPhase]
    if (!gateKeys) break  // F0 has no gates
    const allPass = gateKeys.every(k => gates[k] === true)
    if (allPass) break
    // Mark as blocked
    gates[`${targetPhase.toLowerCase()}_blocked`] = true
    rank--
    computedPhase = PHASE_RANKS[rank] as PhaseCode
  }

  // Viral gate: cap advancement to 1 phase max if viral spike in last 7 days
  if (hasViralSpike) {
    const prevPhaseRun = await admin
      .from('core_phase_runs')
      .select('phase_code')
      .eq('project_id', projectId)
      .order('computed_at', { ascending: false })
      .limit(1)
      .single()

    if (prevPhaseRun.data) {
      const prevRank = PHASE_RANKS.indexOf(prevPhaseRun.data.phase_code)
      const newRank = PHASE_RANKS.indexOf(computedPhase)
      if (newRank > prevRank + 1) {
        computedPhase = PHASE_RANKS[prevRank + 1] as PhaseCode
        gates['viral_gate_applied'] = true
      }
    }
  }

  // Cooldown gate: block further advancement within 30 days of last phase advance
  const lastPhaseChange = await readLatestSignal(admin, projectId, 'phase_changed')
  if (lastPhaseChange) {
    const sig = lastPhaseChange.value as { from?: string; to?: string }
    const wasAdvancement = sig.from && sig.to
      && PHASE_RANKS.indexOf(sig.to) > PHASE_RANKS.indexOf(sig.from)

    if (wasAdvancement) {
      const daysSince = (nowMs - new Date(lastPhaseChange.observed_at).getTime()) / (24 * 3600 * 1000)
      if (daysSince < 30) {
        const prevPhaseRun = await admin
          .from('core_phase_runs')
          .select('phase_code')
          .eq('project_id', projectId)
          .order('computed_at', { ascending: false })
          .limit(1)
          .single()

        if (prevPhaseRun.data) {
          const prevRank = PHASE_RANKS.indexOf(prevPhaseRun.data.phase_code)
          const newRank = PHASE_RANKS.indexOf(computedPhase)
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
  if (hasEvidence)             confidence += 0.2
  if (hasScrape)               confidence += 0.2
  if (coreFlowCompleted >= 2)  confidence += 0.1
  confidence = Math.min(1, confidence)

  // ── Reason summary ────────────────────────────────────────────────────────
  const reasonParts: string[] = []
  if (!hasNiche)           reasonParts.push('niche not defined')
  if (!hasEvidence)        reasonParts.push(`only ${evidenceCount} signals (need 3+)`)
  if (!hasScrape)          reasonParts.push('no scrape data yet')
  if (coreFlowCompleted > 0) reasonParts.push(`${coreFlowCompleted}/5 core flow missions completed`)
  if (gates['viral_gate_applied'])   reasonParts.push('viral gate applied')
  if (gates['cooldown_gate_applied']) reasonParts.push('cooldown gate applied')
  // Report any blocked phases
  for (const p of ['f1_blocked', 'f2_blocked', 'f3_blocked', 'f4_blocked', 'f5_blocked', 'f6_blocked', 'f7_blocked']) {
    if (gates[p]) reasonParts.push(`${p.replace('_blocked', '').toUpperCase()} blocked: gates not met`)
  }

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

// ── Recalculation guardrail ───────────────────────────────────────────────────
// Rules (from SSOT §6):
// 1. Cache TTL: 60 minutes — skip if last run < 60 min ago AND hash unchanged
// 2. Multi-tab prevention: if last run < 5 min ago, always return cached (no recompute)
// 3. force=true bypasses the 60-min cache (e.g. after mission completion)

async function buildInputHash(admin: AdminClient, projectId: string): Promise<string> {
  const [facts, recentSignals] = await Promise.all([
    admin.from('brain_facts').select('fact_key,value,updated_at').eq('project_id', projectId),
    admin.from('brain_signals').select('id').eq('project_id', projectId).order('observed_at', { ascending: false }).limit(50),
  ])
  return createHash('sha256')
    .update(JSON.stringify({ facts: facts.data ?? [], signals: recentSignals.data ?? [] }))
    .digest('hex')
}

export async function runPhaseEngine(
  admin: AdminClient,
  projectId: string,
  force = false
): Promise<PhaseResult & { cached?: boolean }> {
  // Fetch last run
  const { data: lastRun } = await admin
    .from('core_phase_runs')
    .select('*')
    .eq('project_id', projectId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .single()

  const nowMs = Date.now()

  if (lastRun) {
    const lastRunMs = new Date(lastRun.computed_at).getTime()
    const ageMinutes = (nowMs - lastRunMs) / 60000

    // Multi-tab: always return cached if < 5 min ago
    if (ageMinutes < 5 && !force) {
      return {
        phase: lastRun.phase_code as PhaseCode,
        capabilityScore: lastRun.capability_score,
        dimensionScores: lastRun.dimension_scores as DimensionScores,
        gates: lastRun.gates_json as Record<string, boolean>,
        confidence: lastRun.confidence,
        reasonSummary: lastRun.reason_summary,
        cached: true,
      }
    }

    // 60-min cache: skip recompute if hash matches and < 60 min old
    if (!force && ageMinutes < 60 && lastRun.input_hash) {
      const currentHash = await buildInputHash(admin, projectId)
      if (currentHash === lastRun.input_hash) {
        return {
          phase: lastRun.phase_code as PhaseCode,
          capabilityScore: lastRun.capability_score,
          dimensionScores: lastRun.dimension_scores as DimensionScores,
          gates: lastRun.gates_json as Record<string, boolean>,
          confidence: lastRun.confidence,
          reasonSummary: lastRun.reason_summary,
          cached: true,
        }
      }
    }
  }

  const inputHash = await buildInputHash(admin, projectId)
  const result = await computePhase(admin, projectId)

  const previousPhase = lastRun?.phase_code as PhaseCode | null

  // Persist phase run with input_hash
  await admin.from('core_phase_runs').insert({
    project_id: projectId,
    phase_code: result.phase,
    capability_score: result.capabilityScore,
    dimension_scores: result.dimensionScores,
    gates_json: result.gates,
    confidence: result.confidence,
    reason_summary: result.reasonSummary,
    input_hash: inputHash,
  })

  // Write brain facts (per Step 8 spec)
  await writeFact(admin, projectId, 'current_phase', result.phase, 'phase_engine')
  await writeFact(admin, projectId, 'capabilities.current', result.dimensionScores, 'phase_engine')
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
