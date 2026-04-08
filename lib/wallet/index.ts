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

export async function grantPremiumCredits(
  admin: SupabaseClient,
  projectId: string,
  amount: number,
  reasonKey: string,
  idempotencyKey: string
) {
  const { data: existing } = await admin
    .from('core_ledger')
    .select('ledger_id')
    .eq('idempotency_key', idempotencyKey)
    .single()
  if (existing) return

  const { data: wallet } = await admin
    .from('core_wallets')
    .select('wallet_id, premium_credits_balance')
    .eq('project_id', projectId)
    .single()
  if (!wallet) return

  await admin.from('core_wallets')
    .update({ premium_credits_balance: wallet.premium_credits_balance + amount })
    .eq('wallet_id', wallet.wallet_id)
  await admin.from('core_ledger').insert({
    project_id: projectId,
    kind: 'credit',
    amount_premium: amount,
    reason_key: reasonKey,
    idempotency_key: idempotencyKey,
  })
}

export async function debitPremiumCredits(
  admin: SupabaseClient,
  projectId: string,
  amount: number,
  idempotencyKey: string,
  reasonKey: string
) {
  const { data: wallet } = await admin
    .from('core_wallets')
    .select('wallet_id, premium_credits_balance')
    .eq('project_id', projectId)
    .single()
  if (!wallet) return

  const { data: existing } = await admin
    .from('core_ledger')
    .select('ledger_id')
    .eq('idempotency_key', idempotencyKey)
    .single()
  if (existing) return

  await admin
    .from('core_wallets')
    .update({ premium_credits_balance: wallet.premium_credits_balance - amount, updated_at: new Date().toISOString() })
    .eq('wallet_id', wallet.wallet_id)
  await admin.from('core_ledger').insert({
    project_id: projectId,
    kind: 'debit',
    amount_premium: amount,
    reason_key: reasonKey,
    idempotency_key: idempotencyKey,
  })
}

export async function debitLlmCall(admin: SupabaseClient, projectId: string, idempotencyKey: string) {
  const { data: wallet } = await admin
    .from('core_wallets')
    .select('wallet_id, allowance_llm_balance')
    .eq('project_id', projectId)
    .single()
  if (!wallet) return

  // Check if this exact request was already debited
  const { data: existing } = await admin
    .from('core_ledger')
    .select('ledger_id')
    .eq('idempotency_key', idempotencyKey)
    .single()
  if (existing) return

  if (wallet.allowance_llm_balance <= 0) return

  await admin
    .from('core_wallets')
    .update({ allowance_llm_balance: Math.max(0, wallet.allowance_llm_balance - 1) })
    .eq('wallet_id', wallet.wallet_id)
  await admin.from('core_ledger').insert({
    project_id: projectId,
    kind: 'debit',
    amount_allowance: 1,
    reason_key: 'LLM_CALL_STUDIO',
    idempotency_key: idempotencyKey,
  })
}
