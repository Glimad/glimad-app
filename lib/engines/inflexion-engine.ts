// Inflexion Engine — detects significant events requiring strategy change
// Pure function: reads Brain signals from last 72h, returns detected inflexion or null

import { createAdminClient } from '@/lib/supabase/admin'
import { readSignals, readFact, appendSignal } from '@/lib/brain'

type AdminClient = ReturnType<typeof createAdminClient>

export type InflexionType =
  | 'viral_spike'
  | 'engagement_plateau'
  | 'burnout_risk'
  | 'monetization_ready'
  | 'crisis'

export interface InflexionResult {
  type: InflexionType
  confidence: number
  evidence: Record<string, unknown>
}

export async function detectInflexion(
  admin: AdminClient,
  projectId: string
): Promise<InflexionResult | null> {
  const signals72h = await readSignals(admin, projectId, 72)
  const signals14d = await readSignals(admin, projectId, 14 * 24)
  const signals30d = await readSignals(admin, projectId, 30 * 24)

  // Spec uses current_followers; fall back to followers_total if not yet set
  const currentFollowers = (await readFact(admin, projectId, 'current_followers') as number | null)
  const followers = currentFollowers ?? (await readFact(admin, projectId, 'followers_total') as number | null) ?? 0
  const avgEr = (await readFact(admin, projectId, 'avg_engagement_rate') as number | null) ?? 0

  // ── crisis detection ──────────────────────────────────────────────────────
  // Look for negative_sentiment signals, rapid follower loss, or high block rate
  const negativeSentiment = signals72h.some(s => s.signal_key === 'negative_sentiment')
  const followerLoss = signals72h.some(s => {
    if (s.signal_key !== 'growth.followers_total') return false
    const val = s.value as { delta?: number }
    return (val.delta ?? 0) < -100
  })
  const blockRateSignal = signals72h.find(s => s.signal_key === 'block_rate')
  const highBlockRate = blockRateSignal
    ? ((blockRateSignal.value as { rate?: number }).rate ?? 0) > 0.05
    : false

  if (negativeSentiment || followerLoss || highBlockRate) {
    return {
      type: 'crisis',
      confidence: negativeSentiment ? 0.85 : highBlockRate ? 0.80 : 0.70,
      evidence: { negative_sentiment: negativeSentiment, follower_loss: followerLoss, high_block_rate: highBlockRate },
    }
  }

  // ── viral_spike detection ─────────────────────────────────────────────────
  // Condition 1: explicit viral spike signal (from scraper or content tracking)
  const viralSpikeSignals = signals72h.filter(s => s.signal_key === 'content_perf.viral_spike')
  if (viralSpikeSignals.length > 0) {
    const spike = viralSpikeSignals[0].value as { multiplier: number; video_id?: string }
    return {
      type: 'viral_spike',
      confidence: Math.min(0.95, 0.5 + spike.multiplier * 0.1),
      evidence: { multiplier: spike.multiplier, detected_at: viralSpikeSignals[0].observed_at },
    }
  }

  // Condition 2: engagement reach on a single post 3x higher than user's average post reach
  const reachSignals72h = signals72h.filter(s => s.signal_key === 'engagement.post_reach')
  const avgReachSignals30d = signals30d.filter(s => s.signal_key === 'engagement.avg_post_reach')
  if (reachSignals72h.length > 0 && avgReachSignals30d.length > 0) {
    const postReach = (reachSignals72h[0].value as { value: number }).value ?? 0
    const avgReach = (avgReachSignals30d[0].value as { value: number }).value ?? 0
    if (avgReach > 0 && postReach > avgReach * 3) {
      return {
        type: 'viral_spike',
        confidence: 0.85,
        evidence: { post_reach: postReach, avg_reach: avgReach, multiplier: postReach / avgReach },
      }
    }
  }

  // Condition 3: follower growth 3x above 30-day average daily growth
  const growthSignals30d = signals30d
    .filter(s => s.signal_key === 'growth.followers_total')
    .map(s => (s.value as { value: number }).value ?? 0)

  if (growthSignals30d.length >= 2) {
    const oldest = growthSignals30d[growthSignals30d.length - 1]
    const newest = growthSignals30d[0]
    const dailyAvg = oldest > 0 ? (newest - oldest) / 30 : 0
    const recent72hGrowth = signals72h
      .filter(s => s.signal_key === 'growth.followers_total')
      .map(s => (s.value as { value: number }).value ?? 0)

    if (recent72hGrowth.length >= 2) {
      const recentGrowth = recent72hGrowth[0] - recent72hGrowth[recent72hGrowth.length - 1]
      if (dailyAvg > 0 && recentGrowth > dailyAvg * 3 * 3) {
        return {
          type: 'viral_spike',
          confidence: 0.75,
          evidence: { follower_surge: recentGrowth, daily_baseline: dailyAvg },
        }
      }
    }
  }

  // ── monetization_ready detection ──────────────────────────────────────────
  // Spec: no monetization_ready inflexion event in the last 90 days
  const { data: recentMonetization } = await admin
    .from('core_inflexion_events')
    .select('id')
    .eq('project_id', projectId)
    .eq('event_key', 'monetization_ready')
    .gte('created_at', new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString())
    .limit(1)
    .single()

  if (!recentMonetization && followers >= 5000 && avgEr >= 0.03) {
    return {
      type: 'monetization_ready',
      confidence: 0.8,
      evidence: { followers, avg_engagement_rate: avgEr },
    }
  }

  // ── engagement_plateau detection ──────────────────────────────────────────
  // Condition: no positive follower change AND all recent ER signals below 2% for 14d
  const erSignals14d = signals14d.filter(s => s.signal_key === 'engagement.avg_er_7d')
  const hasPositiveGrowth14d = signals14d.some(s => {
    if (s.signal_key !== 'growth.followers_total') return false
    const val = s.value as { delta?: number }
    return (val.delta ?? 0) > 0
  })

  if (erSignals14d.length > 0 && !hasPositiveGrowth14d) {
    // All ER signals in the 14d window must be below 2% (approximates "14 consecutive days")
    const allErLow = erSignals14d.every(s => ((s.value as { value: number }).value ?? 0) < 0.02)
    if (allErLow) {
      const latestEr = (erSignals14d[0].value as { value: number }).value ?? 0
      return {
        type: 'engagement_plateau',
        confidence: 0.7,
        evidence: { avg_er: latestEr, days_without_growth: 14 },
      }
    }
  }

  // ── burnout_risk detection ────────────────────────────────────────────────
  const hasConsistencyGap = signals14d.some(s => s.signal_key === 'consistency_gap')
  const postsLast30d = signals30d
    .filter(s => s.signal_key === 'consistency.posts_published_30d')
    .map(s => (s.value as { value: number }).value ?? 0)
  const postsLast7d = signals14d
    .filter(s => s.signal_key === 'consistency.posts_published_7d')
    .map(s => (s.value as { value: number }).value ?? 0)

  if (hasConsistencyGap && postsLast30d.length >= 2 && postsLast7d.length > 0) {
    const avgMonthly = postsLast30d.reduce((a, b) => a + b, 0) / postsLast30d.length
    const recentWeekly = postsLast7d[0]
    if (recentWeekly < avgMonthly / 4) {
      return {
        type: 'burnout_risk',
        confidence: 0.65,
        evidence: { posts_this_week: recentWeekly, avg_monthly_pace: avgMonthly },
      }
    }
  }

  return null
}

export async function runInflexionEngine(
  admin: AdminClient,
  projectId: string
): Promise<InflexionResult | null> {
  const result = await detectInflexion(admin, projectId)
  if (!result) return null

  // Cooldown check — don't re-fire same inflexion type within 7 days
  const { data: recentEvent } = await admin
    .from('core_inflexion_events')
    .select('id, created_at')
    .eq('project_id', projectId)
    .eq('event_key', result.type)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (recentEvent) return result // already fired recently — return result but don't re-write

  // Write inflexion signal
  await appendSignal(admin, projectId, 'inflexion_detected', {
    type: result.type,
    confidence: result.confidence,
    evidence: result.evidence,
  }, 'inflexion_engine')

  // Persist inflexion event
  const missionMap: Record<InflexionType, string> = {
    viral_spike: 'VIRAL_RESPONSE_V1',
    engagement_plateau: 'ENGAGEMENT_RECOVERY_V1',
    burnout_risk: 'RESCUE_CONSISTENCY_V1',
    monetization_ready: 'DEFINE_OFFER_V1',
    crisis: 'CRISIS_RESPONSE_V1',
  }

  const typeMap: Record<InflexionType, 'alert' | 'upgrade' | 'downgrade' | 'mode_change'> = {
    viral_spike: 'alert',
    engagement_plateau: 'alert',
    burnout_risk: 'downgrade',
    monetization_ready: 'upgrade',
    crisis: 'downgrade',
  }

  const severityMap: Record<InflexionType, 'low' | 'med' | 'high'> = {
    viral_spike: 'high',
    engagement_plateau: 'med',
    burnout_risk: 'high',
    monetization_ready: 'med',
    crisis: 'high',
  }

  await admin.from('core_inflexion_events').insert({
    project_id: projectId,
    event_key: result.type,
    type: typeMap[result.type],
    severity: severityMap[result.type],
    confidence: result.confidence,
    recommended_actions: [missionMap[result.type]],
    evidence_bundle: result.evidence,
    cooldown_hours: 168, // 7 days
  })

  return result
}
