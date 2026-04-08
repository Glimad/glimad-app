// Content Studio — business logic for content generation and approval
// API routes call these functions; no HTTP concerns here.

import { createAdminClient } from '@/lib/supabase/admin'
import { appendSignal } from '@/lib/brain'
import Anthropic from '@anthropic-ai/sdk'

type AdminClient = ReturnType<typeof createAdminClient>

// Platform caption + hashtag limits
export const PLATFORM_LIMITS: Record<string, { caption: number; hashtags: number }> = {
  instagram: { caption: 2200, hashtags: 30 },
  tiktok:    { caption: 2200, hashtags: 10 },
  youtube:   { caption: 5000, hashtags: 15 },
  twitter:   { caption: 280,  hashtags: 5  },
  spotify:   { caption: 1500, hashtags: 0  },
}

// Generate 6 topic ideas for a given content type using Claude Haiku
export async function generateTopics(
  contentType: string,
  niche: string,
  platform: string,
  audience: string
): Promise<string[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const message = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL_HAIKU!,
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `You are a content strategist. Generate exactly 6 topic ideas for a ${contentType} post for a creator in the niche: "${niche}" on ${platform}.${audience ? ` Target audience: ${audience}.` : ''}

Return ONLY a JSON array of 6 strings, each a short topic idea (max 10 words). No explanation. Example: ["Topic 1", "Topic 2", ...]`,
    }],
  })

  const text = (message.content[0] as { type: string; text: string }).text
  const stripped = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const start = stripped.indexOf('[')
  const end = stripped.lastIndexOf(']') + 1
  return JSON.parse(stripped.slice(start, end)) as string[]
}

// Generate full content piece using Claude Sonnet
export async function generateContent(
  contentType: string,
  topic: string,
  niche: string,
  platform: string,
  tone: string,
  audience: string
): Promise<Record<string, unknown>> {
  const limits = PLATFORM_LIMITS[platform] ?? PLATFORM_LIMITS['instagram']
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const message = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL_SONNET!,
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `You are a content writer for a ${platform} creator in the niche: "${niche}".
Tone: ${tone}
Audience: ${audience}
Content type: ${contentType}
Topic: ${topic}

Generate a complete ${contentType} content piece. Return ONLY valid JSON with these fields:
{
  "hook": "attention-grabbing opening line (max 150 chars)",
  "caption": "full caption (max ${limits.caption} chars)",
  "talking_points": ["point 1", "point 2", "point 3"],
  "cta": "call to action (max 100 chars)",
  "hashtags": ["hashtag1", "hashtag2"] (max ${limits.hashtags} items, no # prefix)
}`,
    }],
  })

  const text = (message.content[0] as { type: string; text: string }).text
  const stripped = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}') + 1
  return JSON.parse(stripped.slice(start, end)) as Record<string, unknown>
}

// Save approved content: writes core_assets + core_calendar_items, appends signal
export async function approveContent(
  admin: AdminClient,
  projectId: string,
  contentType: string,
  topic: string,
  content: Record<string, unknown>,
  scheduledAt: string | null
): Promise<{ asset_id: string; calendar_item_id: string }> {
  const { data: asset } = await admin
    .from('core_assets')
    .insert({
      project_id: projectId,
      asset_type: 'content_piece',
      content: { content_type: contentType, topic, ...content },
    })
    .select('id')
    .single()
  if (!asset) throw new Error('Failed to create asset')

  const platform = typeof content.platform === 'string' ? content.platform : null
  const scheduledDate = scheduledAt ? scheduledAt.slice(0, 10) : null
  const idempotencyKey = scheduledDate && platform
    ? `${projectId}:${platform}:${scheduledDate}:${contentType}`
    : null

  const { data: calendarItem } = await admin
    .from('core_calendar_items')
    .insert({
      project_id: projectId,
      asset_id: asset.id,
      content_type: contentType,
      platform,
      scheduled_at: scheduledAt ?? null,
      status: scheduledAt ? 'scheduled' : 'draft',
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    })
    .select('id')
    .single()
  if (!calendarItem) throw new Error('Failed to create calendar item')

  if (scheduledAt) {
    // Spec: append content_scheduled signal + write event_log on approve+schedule
    await appendSignal(admin, projectId, 'content_scheduled', {
      content_type: contentType,
      topic,
      asset_id: asset.id,
      calendar_item_id: calendarItem.id,
      scheduled_at: scheduledAt,
    })
    await admin.from('event_log').insert({
      project_id: projectId,
      event_type: 'content_scheduled',
      event_data: {
        asset_id: asset!.id,
        calendar_item_id: calendarItem.id,
        content_type: contentType,
        platform,
        scheduled_at: scheduledAt,
      },
    })
  } else {
    await appendSignal(admin, projectId, 'content_created', {
      content_type: contentType,
      topic,
      asset_id: asset.id,
      calendar_item_id: calendarItem.id,
    })
  }

  return { asset_id: asset.id, calendar_item_id: calendarItem.id }
}
