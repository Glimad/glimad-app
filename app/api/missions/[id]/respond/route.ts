import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resumeMissionAfterInput } from '@/lib/missions/runner'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const inputs = await req.json()
  const admin = createAdminClient()

  await resumeMissionAfterInput(admin, params.id, inputs)

  return NextResponse.json({ status: 'completed' })
}
