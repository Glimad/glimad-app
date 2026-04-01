import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import { readAllFacts } from '@/lib/brain'
import { checkLlmRateLimit } from '@/lib/security/rate-limit'
import { sanitizeText } from '@/lib/security/sanitize'

// GET /api/studio/topics — returns the user's focus platform and caption limits (no LLM)
export async function GET(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  const facts = await readAllFacts(admin, project!.id)
  const platform = (facts['focus_platform'] as string) ?? 'instagram'

  const captionLimits: Record<string, number> = {
    instagram: 2200,
    tiktok: 2200,
    youtube: 5000,
    twitter: 280,
    spotify: 1500,
  }

  return NextResponse.json({
    platform,
    caption_limit: captionLimits[platform] ?? 2200,
  })
}

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!checkLlmRateLimit(user.id)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const body = await request.json()
  const content_type = sanitizeText(body.content_type, 50)
  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  const facts = await readAllFacts(admin, project!.id)
  const niche = facts['niche_raw'] ?? facts['niche'] ?? 'content creator'
  const platform = facts['focus_platform'] ?? 'instagram'
  const audience = facts['audience_persona'] ?? ''

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const message = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL_HAIKU!,
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `You are a content strategist. Generate exactly 6 topic ideas for a ${content_type} post for a creator in the niche: "${niche}" on ${platform}.${audience ? ` Target audience: ${audience}.` : ''}

Return ONLY a JSON array of 6 strings, each a short topic idea (max 10 words). No explanation. Example: ["Topic 1", "Topic 2", ...]`,
    }],
  })

  const text = (message.content[0] as { type: string; text: string }).text
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']') + 1
  const topics = JSON.parse(text.slice(start, end)) as string[]

  return NextResponse.json({ topics })
}
