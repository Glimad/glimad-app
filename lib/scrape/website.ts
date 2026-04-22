import Anthropic from '@anthropic-ai/sdk'

export interface WebsiteScrapeResult {
  url: string
  fetched_at: string
  title: string | null
  meta_description: string | null
  og_description: string | null
  h1: string[]
  h2: string[]
  body_snippet: string
  links_external: string[]
  social_handles: { platform: string; url: string }[]
}

export interface WebsiteInference {
  niche: string | null
  subniche: string | null
  target_audience: string | null
  unique_angle: string | null
  suggested_platforms: string[]
  confidence: 'high' | 'medium' | 'low'
}

const FETCH_TIMEOUT_MS = 8000
const MAX_HTML_BYTES = 512 * 1024
const USER_AGENT = 'GlimadBot/1.0 (+https://glimad-app.vercel.app)'

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const u = new URL(withProto)
    if (!['http:', 'https:'].includes(u.protocol)) return null
    return u.toString()
  } catch {
    return null
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function extractMeta(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return m[1].trim().slice(0, 500)
  }
  return null
}

function extractAllTags(html: string, tag: string, limit = 10): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const results: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && results.length < limit) {
    const text = stripTags(m[1])
    if (text) results.push(text.slice(0, 200))
  }
  return results
}

function extractSocialHandles(html: string, baseUrl: string): { platform: string; url: string }[] {
  const hrefs = Array.from(html.matchAll(/href=["']([^"']+)["']/gi)).map(m => m[1])
  const seen = new Map<string, string>()
  const socialHosts: [RegExp, string][] = [
    [/(?:^|\.)instagram\.com$/i, 'instagram'],
    [/(?:^|\.)tiktok\.com$/i, 'tiktok'],
    [/(?:^|\.)youtube\.com$/i, 'youtube'],
    [/(?:^|\.)youtu\.be$/i, 'youtube'],
    [/(?:^|\.)(?:twitter|x)\.com$/i, 'twitter'],
    [/(?:^|\.)linkedin\.com$/i, 'linkedin'],
    [/(?:^|\.)facebook\.com$/i, 'facebook'],
    [/(?:^|\.)spotify\.com$/i, 'spotify'],
    [/(?:^|\.)behance\.net$/i, 'behance'],
    [/(?:^|\.)pinterest\.[a-z.]+$/i, 'pinterest'],
  ]
  for (const href of hrefs) {
    try {
      const u = new URL(href, baseUrl)
      for (const [re, platform] of socialHosts) {
        if (re.test(u.hostname) && !seen.has(platform)) {
          seen.set(platform, u.toString())
          break
        }
      }
    } catch {
      // ignore malformed urls
    }
  }
  return Array.from(seen, ([platform, url]) => ({ platform, url }))
}

export async function scrapeWebsite(rawUrl: string): Promise<WebsiteScrapeResult | null> {
  const url = normalizeUrl(rawUrl)
  if (!url) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let html: string
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*;q=0.8' },
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return null
    const buf = await res.arrayBuffer()
    const slice = buf.byteLength > MAX_HTML_BYTES ? buf.slice(0, MAX_HTML_BYTES) : buf
    html = new TextDecoder('utf-8', { fatal: false }).decode(slice)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? stripTags(titleMatch[1]).slice(0, 200) : null

  const h1 = extractAllTags(html, 'h1', 5)
  const h2 = extractAllTags(html, 'h2', 10)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const bodyText = stripTags(bodyMatch ? bodyMatch[1] : html).slice(0, 3000)

  return {
    url,
    fetched_at: new Date().toISOString(),
    title,
    meta_description: extractMeta(html, 'description'),
    og_description: extractMeta(html, 'og:description'),
    h1,
    h2,
    body_snippet: bodyText,
    links_external: [],
    social_handles: extractSocialHandles(html, url),
  }
}

function buildInferencePrompt(scrape: WebsiteScrapeResult): string {
  return `You are analyzing a creator or small-business website to infer their niche and audience.

Website: ${scrape.url}
Title: ${scrape.title ?? '(none)'}
Meta description: ${scrape.meta_description ?? '(none)'}
OG description: ${scrape.og_description ?? '(none)'}
H1 headings: ${scrape.h1.slice(0, 3).join(' | ') || '(none)'}
H2 headings: ${scrape.h2.slice(0, 5).join(' | ') || '(none)'}
Body excerpt:
${scrape.body_snippet}

Return ONLY a JSON object (no prose, no markdown fences) with this exact shape:
{
  "niche": string | null,
  "subniche": string | null,
  "target_audience": string | null,
  "unique_angle": string | null,
  "suggested_platforms": string[],
  "confidence": "high" | "medium" | "low"
}

Rules:
- niche: one short phrase (e.g. "fitness coaching", "indie music", "sustainable fashion").
- subniche: more specific refinement, or null if not evident.
- target_audience: who this serves, one short phrase.
- unique_angle: what makes them distinctive, one short phrase.
- suggested_platforms: up to 3 platforms from [instagram, tiktok, youtube, twitter, linkedin, spotify, pinterest, behance, facebook] ranked by fit for this niche. Pick based on where this kind of creator typically wins, not based on what's already linked.
- confidence: "high" if content is clear and specific; "medium" if generic; "low" if minimal content.
- If the site is essentially empty or unrelated (coming-soon, parked, 404), return nulls and confidence "low".`
}

export async function inferFromWebsite(scrape: WebsiteScrapeResult): Promise<WebsiteInference | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const model = process.env.ANTHROPIC_MODEL_HAIKU || 'claude-haiku-4-5'
  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model,
      max_tokens: 512,
      messages: [{ role: 'user', content: buildInferencePrompt(scrape) }],
    })
    const text = (message.content.find(c => c.type === 'text') as { type: 'text'; text: string } | undefined)?.text ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0]) as Partial<WebsiteInference>

    const allowed = new Set(['instagram', 'tiktok', 'youtube', 'twitter', 'linkedin', 'spotify', 'pinterest', 'behance', 'facebook'])
    const suggested = Array.isArray(parsed.suggested_platforms)
      ? parsed.suggested_platforms.map(p => String(p).toLowerCase()).filter(p => allowed.has(p)).slice(0, 3)
      : []
    const confidence: WebsiteInference['confidence'] =
      parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'low'

    return {
      niche: parsed.niche ? String(parsed.niche).slice(0, 200) : null,
      subniche: parsed.subniche ? String(parsed.subniche).slice(0, 200) : null,
      target_audience: parsed.target_audience ? String(parsed.target_audience).slice(0, 200) : null,
      unique_angle: parsed.unique_angle ? String(parsed.unique_angle).slice(0, 200) : null,
      suggested_platforms: suggested,
      confidence,
    }
  } catch {
    return null
  }
}
