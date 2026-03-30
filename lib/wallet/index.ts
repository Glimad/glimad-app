import type { SupabaseClient } from '@supabase/supabase-js'

export async function getWalletBalance(admin: SupabaseClient, projectId: string) {
  const { data: wallet } = await admin
    .from('core_wallets')
    .select('allowance_llm_balance, premium_credits_balance, plan_code')
    .eq('project_id', projectId)
    .single()
  return wallet
}

export async function hasLlmCalls(admin: SupabaseClient, projectId: string): Promise<boolean> {
  const wallet = await getWalletBalance(admin, projectId)
  return (wallet?.allowance_llm_balance ?? 0) > 0
}

export async function hasPremiumCredits(admin: SupabaseClient, projectId: string, amount: number): Promise<boolean> {
  const wallet = await getWalletBalance(admin, projectId)
  return (wallet?.premium_credits_balance ?? 0) >= amount
}

export async function debitLlmCall(admin: SupabaseClient, projectId: string) {
  const { data: wallet } = await admin
    .from('core_wallets')
    .select('wallet_id, allowance_llm_balance')
    .eq('project_id', projectId)
    .single()
  if (!wallet) return
  await admin
    .from('core_wallets')
    .update({ allowance_llm_balance: wallet.allowance_llm_balance - 1 })
    .eq('wallet_id', wallet.wallet_id)
  await admin.from('core_ledger').insert({
    project_id: projectId,
    kind: 'debit',
    amount_allowance: -1,
    reason_key: 'LLM_CALL_STUDIO',
    idempotency_key: `llm_call_studio_${wallet.wallet_id}_${Date.now()}`,
  })
}
