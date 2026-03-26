import { createAdminClient } from '@/lib/supabase/admin'

export function extractToken(request: Request): string | null {
  const cookie = request.headers.get('cookie') ?? ''
  const match = cookie.match(/sb-awaakurvnngazmnnmwza-auth-token=base64-([^;]+)/)
  if (!match) return null
  const decoded = Buffer.from(match[1], 'base64').toString('utf-8')
  const parsed = JSON.parse(decoded)
  return parsed.access_token ?? null
}

export async function getAuthUser(request: Request) {
  const token = extractToken(request)
  if (!token) return null
  const admin = createAdminClient()
  const { data: { user } } = await admin.auth.getUser(token)
  return user ?? null
}
