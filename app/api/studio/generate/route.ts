import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/extract-token'

export const maxDuration = 60
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import { readAllFacts } from '@/lib/brain'
import { debitLlmCall } from '@/lib/wallet'
import { checkLlmRateLimitDb } from '@/lib/security/rate-limit'
import { sanitizeText } from '@/lib/security/sanitize'

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const content_type = sanitizeText(body.content_type, 50)
  const topic = sanitizeText(body.topic, 300)
  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  if (!await checkLlmRateLimitDb(admin, project!.id)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const facts = await readAllFacts(admin, project!.id)
  const niche = facts['niche_raw'] ?? facts['niche'] ?? 'content creator'
  const platform = facts['focus_platform'] ?? 'instagram'
  const brandKit = facts['brand_kit'] as Record<string, unknown> | null
  const tone = (brandKit?.tone_of_voice as string) ?? 'authentic and engaging'
  const audienceRaw = facts['audience_persona']
  const audience = typeof audienceRaw === 'object' && audienceRaw !== null
    ? JSON.stringify(audienceRaw).slice(0, 400)
    : (audienceRaw as string) ?? 'general audience'

  const platformLimits: Record<string, { caption: number; hashtags: number }> = {
    instagram: { caption: 2200, hashtags: 30 },
    tiktok: { caption: 2200, hashtags: 10 },
    youtube: { caption: 5000, hashtags: 15 },
    twitter: { caption: 280, hashtags: 5 },
    spotify: { caption: 1500, hashtags: 0 },
  }
  const limits = platformLimits[platform as string] ?? platformLimits['instagram']

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const message = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL_SONNET!,
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `You are a content writer for a ${platform} creator in the niche: "${niche}".
Tone: ${tone}
Audience: ${audience}
Content type: ${content_type}
Topic: ${topic}

Generate a complete ${content_type} content piece. Return ONLY valid JSON with these fields:
{
  "hook": "attention-grabbing opening line (max 150 chars)",
  "caption": "full caption (max ${limits.caption} chars)",
  "talking_points": ["point 1", "point 2", "point 3"],
  "cta": "call to action (max 100 chars)",
  "hashtags": ["hashtag1", "hashtag2"] (max ${limits.hashtags} items, no # prefix)
}`,
    }],
  })

  const idempotencyKey = `studio:${project!.id}:${content_type}:${Buffer.from(topic).toString('base64').slice(0, 32)}`
  await debitLlmCall(admin, project!.id, idempotencyKey)

  const text = (message.content[0] as { type: string; text: string }).text
  const stripped = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}') + 1
  const content = JSON.parse(stripped.slice(start, end))

  return NextResponse.json({ content })
}
