import type { SupabaseClient } from '@supabase/supabase-js'

// In-memory fallback (single-instance only — used for non-critical limits)
const counters = new Map<string, { count: number; resetAt: number }>()

function memoryRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = counters.get(key)

  if (!entry || now > entry.resetAt) {
    counters.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false
  entry.count++
  return true
}

setInterval(() => {
  const now = Date.now()
  Array.from(counters.keys()).forEach(key => {
    if (now > counters.get(key)!.resetAt) counters.delete(key)
  })
}, 5 * 60 * 1000)

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return 'unknown'
}

export function checkAuthRateLimit(ip: string): boolean {
  // Supabase Auth has its own rate limiting on sign-in attempts
  return memoryRateLimit(`auth:${ip}`, 5, 60 * 1000)
}

// DB-backed LLM rate limit: counts ledger debits in the last minute
export async function checkLlmRateLimitDb(
  admin: SupabaseClient,
  projectId: string,
  limitPerMinute = 10
): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 1000).toISOString()
  const { count } = await admin
    .from('core_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('reason_key', 'LLM_CALL_STUDIO')
    .gte('created_at', since)

  return (count ?? 0) < limitPerMinute
}

export function checkLlmRateLimit(userId: string): boolean {
  return memoryRateLimit(`llm:${userId}`, 10, 60 * 1000)
}

export function checkApiRateLimit(userId: string): boolean {
  return memoryRateLimit(`api:${userId}`, 100, 60 * 1000)
}
