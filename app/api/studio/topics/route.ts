import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { readAllFacts } from '@/lib/brain'
import { checkLlmRateLimit } from '@/lib/security/rate-limit'
import { sanitizeText } from '@/lib/security/sanitize'
import { generateTopics, PLATFORM_LIMITS } from '@/lib/studio'

// GET /api/studio/topics — returns focus platform + caption limit (no LLM)
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
  const focusObj = facts['platforms.focus'] as Record<string, unknown> | null
  const platform = String(focusObj?.platform ?? 'instagram')

  return NextResponse.json({
    platform,
    caption_limit: PLATFORM_LIMITS[platform]?.caption ?? 2200,
  })
}

// POST /api/studio/topics — generate 6 topic ideas with Claude Haiku
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
  const nicheObj = facts['identity.niche'] as Record<string, unknown> | null
  const niche = String(nicheObj?.niche ?? nicheObj?.value ?? 'content creator')
  const focusObj2 = facts['platforms.focus'] as Record<string, unknown> | null
  const platform = String(focusObj2?.platform ?? 'instagram')
  const audienceRaw = facts['identity.audience_persona']
  const audience = typeof audienceRaw === 'object' && audienceRaw !== null
    ? JSON.stringify(audienceRaw).slice(0, 200)
    : String(audienceRaw ?? '')

  const topics = await generateTopics(content_type, niche, platform, audience)
  return NextResponse.json({ topics })
}
