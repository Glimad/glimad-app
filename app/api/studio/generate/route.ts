import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { readAllFacts } from '@/lib/brain'
import { debitLlmCall } from '@/lib/wallet'
import { checkLlmRateLimitDb } from '@/lib/security/rate-limit'
import { sanitizeText } from '@/lib/security/sanitize'
import { generateContent } from '@/lib/studio'

export const maxDuration = 60

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
  const nicheObj = facts['identity.niche'] as Record<string, unknown> | null
  const niche = String(nicheObj?.niche ?? nicheObj?.value ?? 'content creator')
  const focusObj = facts['platforms.focus'] as Record<string, unknown> | null
  const platform = String(focusObj?.platform ?? 'instagram')
  const brandKit = facts['identity.brand_kit'] as Record<string, unknown> | null
  const tone = String((brandKit?.tone_of_voice as string) ?? 'authentic and engaging')
  const audienceRaw = facts['identity.audience_persona']
  const audience = typeof audienceRaw === 'object' && audienceRaw !== null
    ? JSON.stringify(audienceRaw).slice(0, 400)
    : String(audienceRaw ?? 'general audience')

  const content = await generateContent(content_type, topic, niche, platform, tone, audience)

  const idempotencyKey = `studio:${project!.id}:${content_type}:${Buffer.from(topic).toString('base64').slice(0, 32)}`
  await debitLlmCall(admin, project!.id, idempotencyKey)

  return NextResponse.json({ content })
}
