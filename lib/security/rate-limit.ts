// In-memory rate limiter (per process, reset on restart — Redis later)
const counters = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = counters.get(key)

  if (!entry || now > entry.resetAt) {
    counters.set(key, { count: 1, resetAt: now + windowMs })
    return true // allowed
  }

  if (entry.count >= limit) return false // blocked

  entry.count++
  return true // allowed
}

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  Array.from(counters.keys()).forEach(key => {
    const entry = counters.get(key)!
    if (now > entry.resetAt) counters.delete(key)
  })
}, 5 * 60 * 1000)

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return 'unknown'
}

// Rate limit presets
export function checkAuthRateLimit(ip: string): boolean {
  return rateLimit(`auth:${ip}`, 5, 60 * 1000) // 5 req/min per IP
}

export function checkLlmRateLimit(userId: string): boolean {
  return rateLimit(`llm:${userId}`, 10, 60 * 1000) // 10 req/min per user
}

export function checkApiRateLimit(userId: string): boolean {
  return rateLimit(`api:${userId}`, 100, 60 * 1000) // 100 req/min per user
}
