import { createAdminClient } from '@/lib/supabase/admin'

export function extractToken(request: Request): string | null {
  // 1. Bearer token in Authorization header (API/programmatic access)
  const authHeader = request.headers.get('authorization') ?? ''
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token) return token
  }

  // 2. Supabase session cookie (browser/SSR access)
  const cookie = request.headers.get('cookie') ?? ''
  const supabaseRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
  const match = cookie.match(new RegExp(`sb-${supabaseRef}-auth-token=base64-([^;]+)`))
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
