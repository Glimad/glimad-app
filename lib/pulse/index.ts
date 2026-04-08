import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { readAllFacts, appendSignal } from '@/lib/brain'

export interface PulseActionItem {
  priority: 'high' | 'medium' | 'low'
  category: 'content' | 'consistency' | 'growth' | 'engagement'
  action: string
  reasoning: string
}

export interface PulseRun {
  id: string
  project_id: string
  action_items: PulseActionItem[]
  signals_collected: number
  phase_code: string | null
  started_at: string
  completed_at: string | null
}

export async function getLatestPulse(admin: SupabaseClient, projectId: string): Promise<PulseRun | null> {
  const { data } = await admin
    .from('pulse_runs')
    .select('*')
    .eq('project_id', projectId)
    .not('completed_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()
  return data ?? null
}

export async function shouldRunPulse(admin: SupabaseClient, projectId: string): Promise<boolean> {
  const { data: signals } = await admin
    .from('brain_signals')
    .select('id')
    .eq('project_id', projectId)
    .limit(1)

  if (!signals || signals.length === 0) return false

  const latest = await getLatestPulse(admin, projectId)
  if (!latest) return true

  // Max 1 pulse per 24h (per spec Step 14)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return new Date(latest.started_at) < twentyFourHoursAgo
}

export async function runPulse(
  admin: SupabaseClient,
  projectId: string,
  triggeredBy: 'schedule' | 'event' | 'manual' = 'schedule'
): Promise<PulseRun> {
  const now = new Date()
  const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  let { data: signals } = await admin
    .from('brain_signals')
    .select('signal_key, value, observed_at')
    .eq('project_id', projectId)
    .gte('observed_at', h24ago)
    .order('observed_at', { ascending: false })

  if (!signals || signals.length < 3) {
    const h72ago = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString()
    const { data: extended } = await admin
      .from('brain_signals')
      .select('signal_key, value, observed_at')
      .eq('project_id', projectId)
      .gte('observed_at', h72ago)
      .order('observed_at', { ascending: false })
    signals = extended ?? []
  }

  const facts = await readAllFacts(admin, projectId)
  const phase = (facts['current_phase'] as string) ?? 'F0'
  const nicheFact = facts['identity.niche'] as { niche?: string } | string | null
  const niche = (typeof nicheFact === 'object' && nicheFact !== null ? nicheFact.niche : nicheFact as string) ?? 'content creator'
  const platformFact = facts['platforms.focus'] as { platform?: string } | null
  const platform = platformFact?.platform ?? 'instagram'

  const { data: recentMissions } = await admin
    .from('mission_instances')
    .select('template_code, completed_at')
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .gte('completed_at', new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString())
    .order('completed_at', { ascending: false })
    .limit(5)

  const signalsSummary = signals.length > 0
    ? signals.map(s => `- ${s.signal_key}: ${JSON.stringify(s.value)}`).join('\n')
    : 'No signals recorded yet'

  const missionsSummary = recentMissions?.length
    ? recentMissions.map(m => `- ${m.template_code}`).join('\n')
    : 'none'

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const message = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL_HAIKU!,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are a growth coach for a ${platform} creator in the "${niche}" niche.
Current growth phase: ${phase}

Recent brain signals:
${signalsSummary}

Recently completed missions:
${missionsSummary}

Provide 3-7 specific action items to help this creator grow right now.
Return ONLY valid JSON:
{
  "action_items": [
    {
      "priority": "high",
      "category": "content",
      "action": "specific action (max 120 chars)",
      "reasoning": "why this matters now (max 200 chars)"
    }
  ]
}
priority: high | medium | low
category: content | consistency | growth | engagement`,
    }],
  })

  const text = (message.content[0] as { type: string; text: string }).text
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(jsonMatch![0]) as { action_items: PulseActionItem[] }

  const { data: pulseRun } = await admin
    .from('pulse_runs')
    .insert({
      project_id: projectId,
      triggered_by: triggeredBy,
      signals_collected: signals.length,
      events_detected: 0,
      missions_assigned: 0,
      action_items: parsed.action_items,
      phase_code: phase,
      started_at: now.toISOString(),
      completed_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  await appendSignal(admin, projectId, 'pulse_completed', {
    action_items_count: parsed.action_items.length,
    signals_used: signals.length,
  }, 'pulse_engine')

  return pulseRun!
}
