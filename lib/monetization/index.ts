// Monetization Center — business logic
// All KPI calculations, health score computation, AI product suggestion

import { createAdminClient } from '@/lib/supabase/admin'
import { readFacts } from '@/lib/brain'
import Anthropic from '@anthropic-ai/sdk'

type AdminClient = ReturnType<typeof createAdminClient>

// ── KPIs ──────────────────────────────────────────────────────────────────

export async function getMonetizationKpis(admin: AdminClient, projectId: string) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [eventsResult, activeProductsResult] = await Promise.all([
    admin
      .from('monetization_events')
      .select('event_type, amount, event_date, created_at')
      .eq('project_id', projectId),
    admin
      .from('monetization_products')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'active'),
  ])

  const events = eventsResult.data ?? []
  const activeStreams = activeProductsResult.count ?? 0

  const totalRevenue = events
    .filter(e => e.event_type === 'sale')
    .reduce((sum, e) => sum + Number(e.amount), 0)

  const thisMonthRevenue = events
    .filter(e => e.event_type === 'sale' && e.event_date >= monthStart.substring(0, 10))
    .reduce((sum, e) => sum + Number(e.amount), 0)

  const mrr = events
    .filter(e => e.event_type === 'subscription_start' && e.created_at >= monthStart)
    .reduce((sum, e) => sum + Number(e.amount), 0)

  return {
    totalRevenue,
    thisMonthRevenue,
    mrr,
    activeStreams,
  }
}

// ── Product health score (4 dimensions) ──────────────────────────────────

export async function computeProductHealth(
  admin: AdminClient,
  projectId: string,
  productId: string
) {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 3600 * 1000)

  const [product, allEvents] = await Promise.all([
    admin.from('monetization_products').select('*').eq('id', productId).single().then(r => r.data),
    admin.from('monetization_events').select('*').eq('product_id', productId),
  ])

  if (!product) return null

  const events = allEvents.data ?? []

  // 1. Activity (25%): has revenue event in last 30 days?
  const recentEvents = events.filter(e => new Date(e.event_date) >= thirtyDaysAgo)
  const activityScore = recentEvents.length > 0 ? 100 : 0

  // 2. Traction (25%): revenue trend
  const last30dRevenue = recentEvents
    .filter(e => e.event_type === 'sale')
    .reduce((s, e) => s + Number(e.amount), 0)
  const prev30dRevenue = events
    .filter(e => new Date(e.event_date) >= sixtyDaysAgo && new Date(e.event_date) < thirtyDaysAgo && e.event_type === 'sale')
    .reduce((s, e) => s + Number(e.amount), 0)
  let tractionScore: number
  if (prev30dRevenue === 0 && last30dRevenue === 0) tractionScore = 50 // neutral, no data
  else if (prev30dRevenue === 0 && last30dRevenue > 0) tractionScore = 90 // started earning
  else if (last30dRevenue > prev30dRevenue) tractionScore = Math.min(100, 60 + ((last30dRevenue - prev30dRevenue) / prev30dRevenue) * 40)
  else if (last30dRevenue === prev30dRevenue) tractionScore = 60
  else tractionScore = Math.max(0, 60 - ((prev30dRevenue - last30dRevenue) / prev30dRevenue) * 60)

  // 3. Fit (25%): completeness as proxy (LLM-computed fit would require credit; skip for now)
  // Using completeness here as a simple proxy — a proper LLM fit check can be added later
  const hasUrl = !!product.url
  const hasPrice = product.price_amount != null
  const hasPlatform = !!product.platform
  const hasNotes = !!product.notes
  const completenessScore = ([hasUrl, hasPrice, hasPlatform, hasNotes].filter(Boolean).length / 4) * 100

  // 4. Completeness (25%): same as above (explicitly per spec)
  const fitnessScore = completenessScore // re-use until LLM fit is wired

  const healthScore = Math.round((activityScore + tractionScore + fitnessScore + completenessScore) / 4)

  return {
    health: healthScore,
    color: healthScore >= 70 ? 'green' : healthScore >= 40 ? 'amber' : 'red',
    dimensions: {
      activity: Math.round(activityScore),
      traction: Math.round(tractionScore),
      fit: Math.round(fitnessScore),
      completeness: Math.round(completenessScore),
    },
  }
}

// ── AI product suggestion ─────────────────────────────────────────────────

export async function generateProductSuggestion(admin: AdminClient, projectId: string) {
  const facts = await readFacts(admin, projectId, [
    'identity.niche',
    'identity.north_star',
    'content.pillars',
    'platforms.focus',
    'current_phase',
    'audience_persona',
  ])

  const { data: existingProducts } = await admin
    .from('monetization_products')
    .select('name, type, status')
    .eq('project_id', projectId)
    .eq('status', 'active')

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const prompt = `You are a monetization advisor for content creators. Based on this creator profile, suggest ONE product they should create next.

Creator profile:
- Niche: ${JSON.stringify(facts['identity.niche'] ?? 'Unknown')}
- North Star: ${JSON.stringify(facts['identity.north_star'] ?? 'Not set')}
- Content pillars: ${JSON.stringify(facts['content.pillars'] ?? [])}
- Focus platform: ${facts['platforms.focus'] ?? 'Not set'}
- Growth phase: ${facts['current_phase'] ?? 'F0'}
- Audience persona: ${JSON.stringify(facts['audience_persona'] ?? {})}

Existing active products: ${JSON.stringify(existingProducts ?? [])}

Return ONLY valid JSON (no markdown):
{
  "product_type": "digital_product" | "service" | "membership" | "affiliate" | "brand_deal" | "course",
  "name": "product name",
  "rationale": "1-2 sentence explanation of why this fits their niche and phase",
  "suggested_price": 49,
  "suggested_platform": "gumroad",
  "prefill_fields": { "notes": "..." }
}`

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL_HAIKU!,
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (response.content[0] as { text: string }).text
  return parseJsonFromLlm(text)
}

function parseJsonFromLlm(text: string): unknown {
  // Strip markdown code fences if present
  const stripped = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}') + 1
  return JSON.parse(stripped.slice(start, end))
}
