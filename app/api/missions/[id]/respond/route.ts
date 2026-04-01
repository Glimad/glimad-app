import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { resumeMissionAfterInput } from '@/lib/missions/runner'

export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const inputs = await req.json()
  const admin = createAdminClient()

  await resumeMissionAfterInput(admin, params.id, inputs)

  return NextResponse.json({ status: 'completed' })
}
