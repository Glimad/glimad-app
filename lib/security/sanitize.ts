// Strip HTML tags and limit string length
export function sanitizeText(input: unknown, maxLength = 1000): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/<[^>]*>/g, '') // strip HTML tags
    .replace(/javascript:/gi, '') // strip JS protocol
    .slice(0, maxLength)
    .trim()
}

export function sanitizeUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return url.toString()
  } catch {
    return null
  }
}

export function sanitizeHandle(input: unknown, maxLength = 100): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[^a-zA-Z0-9._@\-\/]/g, '')
    .slice(0, maxLength)
    .trim()
}

export function sanitizeRecord(
  obj: Record<string, unknown>,
  fields: string[],
  maxLength = 500
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const field of fields) {
    result[field] = sanitizeText(obj[field], maxLength)
  }
  return result
}
