import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ access_state: 'unauthenticated' }, { status: 401 })

  const admin = createAdminClient()

  // Check active access grant
  const { data: grant } = await admin
    .from('core_access_grants')
    .select('status, reference_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!grant) {
    return NextResponse.json({ access_state: 'needs_payment', plan_tier: null, wallet_balance: 0 })
  }

  // Get subscription
  const { data: sub } = await admin
    .from('core_subscriptions')
    .select('plan_code, status, current_period_end')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!sub || sub.status !== 'active') {
    return NextResponse.json({ access_state: 'needs_payment', plan_tier: null, wallet_balance: 0 })
  }

  // Get wallet balance
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  const { data: wallet } = await admin
    .from('core_wallets')
    .select('premium_credits_balance, allowance_llm_balance, status')
    .eq('project_id', project!.id)
    .single()

  return NextResponse.json({
    access_state: 'active',
    plan_tier: sub.plan_code,
    period_end: sub.current_period_end,
    wallet_balance: wallet?.premium_credits_balance ?? 0,
    allowance_balance: wallet?.allowance_llm_balance ?? 0,
  })
}
