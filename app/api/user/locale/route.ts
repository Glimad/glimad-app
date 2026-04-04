import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/extract-token'

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { locale } = await req.json()
  const admin = createAdminClient()

  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, locale },
  })

  return NextResponse.json({ ok: true })
}
