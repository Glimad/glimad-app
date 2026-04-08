import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { approveContent } from '@/lib/studio'

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content_type, topic, content, scheduled_at } = await request.json()
  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  const result = await approveContent(
    admin, project!.id, content_type, topic, content, scheduled_at ?? null
  )

  return NextResponse.json(result)
}
