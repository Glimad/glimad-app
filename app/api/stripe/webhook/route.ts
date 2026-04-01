import { createAdminClient } from '@/lib/supabase/admin'
import { seedBrainFromOnboarding } from '@/lib/onboarding/brain-seed'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  })
  return res.json()
}

async function getPlanCredits(
  admin: ReturnType<typeof createAdminClient>,
  planCode: string
): Promise<{ allowance: number; premium: number }> {
  const { data } = await admin
    .from('core_plans')
    .select('allowance_llm_monthly, premium_credits_monthly')
    .eq('plan_code', planCode)
    .single()
  return {
    allowance: data?.allowance_llm_monthly ?? 2000,
    premium: data?.premium_credits_monthly ?? 500,
  }
}

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')!
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

  const event = stripe.webhooks.constructEvent(body, sig, webhookSecret)

  const admin = createAdminClient()

  // Idempotency: skip already-processed events
  const { data: existing } = await admin
    .from('stripe_events')
    .select('id, processed')
    .eq('stripe_event_id', event.id)
    .single()

  if (existing?.processed) {
    return NextResponse.json({ received: true })
  }

  // Save raw event
  await admin.from('stripe_events').upsert({
    stripe_event_id: event.id,
    event_type: event.type,
    data: event.data,
    processed: false,
  }, { onConflict: 'stripe_event_id' })

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.mode !== 'subscription') {
      await admin.from('stripe_events').update({ processed: true }).eq('stripe_event_id', event.id)
      return NextResponse.json({ received: true })
    }
    await handleSubscriptionActivated(admin, event.id, session)
  }

  if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice
    await handleInvoicePaid(admin, event.id, invoice)
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    await handlePaymentFailed(admin, invoice)
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    await handleChargeRefunded(admin, charge)
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    await handleSubscriptionDeleted(admin, sub)
  }

  await admin.from('stripe_events').update({ processed: true }).eq('stripe_event_id', event.id)
  return NextResponse.json({ received: true })
}

async function handleSubscriptionActivated(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  session: Stripe.Checkout.Session
) {
  const userId = session.metadata?.user_id ?? session.client_reference_id
  const planCode = session.metadata?.plan_code ?? 'BASE'
  if (!userId) return

  const projectId = await getProjectId(admin, userId)

  // Retrieve full subscription
  const stripeSub = await stripeGet(`/subscriptions/${session.subscription}`)
  const item = stripeSub.items.data[0]

  // Upsert core_subscriptions
  await admin.from('core_subscriptions').upsert({
    project_id: projectId,
    user_id: userId,
    stripe_customer_id: session.customer as string,
    stripe_subscription_id: stripeSub.id,
    plan_code: planCode,
    status: 'active',
    current_period_start: new Date(item.current_period_start * 1000).toISOString(),
    current_period_end: new Date(item.current_period_end * 1000).toISOString(),
    cancel_at_period_end: stripeSub.cancel_at_period_end,
  }, { onConflict: 'stripe_subscription_id' })

  // Upsert access grant
  await admin.from('core_access_grants').upsert({
    user_id: userId,
    project_id: projectId,
    source: 'subscription',
    status: 'active',
    reference_id: stripeSub.id,
  }, { onConflict: 'reference_id' })

  // Initialize wallet + grant credits
  await grantMonthlyCredits(admin, userId, planCode, stripeSub.id, item.current_period_end)

  // Seed Brain Facts from onboarding answers + compute initial phase
  await seedBrainFromOnboarding(admin, userId, projectId)
}

async function handleInvoicePaid(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  invoice: Stripe.Invoice
) {
  const subscriptionId = typeof invoice.parent?.subscription_details?.subscription === 'string'
    ? invoice.parent.subscription_details.subscription
    : invoice.parent?.subscription_details?.subscription?.id

  if (!subscriptionId) return

  const { data: sub } = await admin
    .from('core_subscriptions')
    .select('user_id, plan_code, project_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single()

  if (!sub) return

  // Update period
  const stripeSub = await stripeGet(`/subscriptions/${subscriptionId}`)
  const periodItem = stripeSub.items.data[0]
  await admin.from('core_subscriptions').update({
    status: 'active',
    current_period_start: new Date(periodItem.current_period_start * 1000).toISOString(),
    current_period_end: new Date(periodItem.current_period_end * 1000).toISOString(),
  }).eq('stripe_subscription_id', subscriptionId)

  // Grant renewal credits (idempotency key uses invoice ID)
  const idempKey = `invoice_${invoice.id}_grant`
  const { data: alreadyGranted } = await admin
    .from('core_ledger')
    .select('ledger_id')
    .eq('idempotency_key', idempKey)
    .single()

  if (alreadyGranted) return

  await grantMonthlyCredits(
    admin, sub.user_id, sub.plan_code,
    subscriptionId,
    periodItem.current_period_end,
    invoice.id
  )
}

async function handlePaymentFailed(
  admin: ReturnType<typeof createAdminClient>,
  invoice: Stripe.Invoice
) {
  const subscriptionId = typeof invoice.parent?.subscription_details?.subscription === 'string'
    ? invoice.parent.subscription_details.subscription
    : invoice.parent?.subscription_details?.subscription?.id

  if (!subscriptionId) return

  await admin.from('core_subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', subscriptionId)

  // Suspend wallet so write operations are blocked after 7-day grace period
  // The wallet status 'past_due' signals the app to show the grace period banner
  const { data: sub } = await admin
    .from('core_subscriptions')
    .select('project_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single()

  if (sub?.project_id) {
    await admin.from('core_wallets')
      .update({ status: 'past_due' })
      .eq('project_id', sub.project_id)
  }
}

async function handleChargeRefunded(
  admin: ReturnType<typeof createAdminClient>,
  charge: Stripe.Charge
) {
  const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id
  if (!customerId) return

  // Find subscription via customer
  const { data: sub } = await admin
    .from('core_subscriptions')
    .select('id, project_id, stripe_subscription_id')
    .eq('stripe_customer_id', customerId)
    .eq('status', 'active')
    .single()

  if (!sub) return

  await admin.from('core_subscriptions')
    .update({ status: 'canceled', cancel_at_period_end: false })
    .eq('id', sub.id)

  // Revoke access grant
  await admin.from('core_access_grants')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('reference_id', sub.stripe_subscription_id)
    .eq('status', 'active')

  // Lock wallet — blocks all write operations
  await admin.from('core_wallets')
    .update({ status: 'locked' })
    .eq('project_id', sub.project_id)

  // Log refund in ledger
  await admin.from('core_ledger').insert({
    project_id: sub.project_id,
    kind: 'adjustment',
    amount_allowance: 0,
    amount_premium: 0,
    reason_key: 'REFUND_CREDIT',
    ref_type: 'refund',
    ref_id: charge.id,
    idempotency_key: `refund_${charge.id}`,
    metadata_json: { charge_id: charge.id, amount_refunded: charge.amount_refunded },
  })
}

async function handleSubscriptionDeleted(
  admin: ReturnType<typeof createAdminClient>,
  sub: Stripe.Subscription
) {
  await admin.from('core_subscriptions')
    .update({ status: 'canceled', cancel_at_period_end: false })
    .eq('stripe_subscription_id', sub.id)

  await admin.from('core_access_grants')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('reference_id', sub.id)
    .eq('status', 'active')
}

async function grantMonthlyCredits(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  planCode: string,
  subscriptionId: string,
  periodEnd: number,
  invoiceId?: string
) {
  const credits = await getPlanCredits(admin, planCode)
  const projectId = await getProjectId(admin, userId)
  const resetAt = new Date(periodEnd * 1000).toISOString()
  const idempKey = invoiceId
    ? `invoice_${invoiceId}_grant`
    : `subscription_grant_${subscriptionId}_${periodEnd}`

  // Upsert wallet
  await admin.from('core_wallets').upsert({
    project_id: projectId,
    plan_code: planCode,
    allowance_llm_balance: credits.allowance,
    credits_allowance: credits.allowance,
    premium_credits_balance: credits.premium,
    premium_daily_cap_remaining: credits.premium,
    allowance_reset_at: resetAt,
    premium_reset_at: resetAt,
    status: 'active',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id' })

  // Ledger credit entry
  await admin.from('core_ledger').insert({
    project_id: projectId,
    kind: 'credit',
    amount_allowance: credits.allowance,
    amount_premium: credits.premium,
    reason_key: 'PLAN_MONTHLY_GRANT',
    ref_type: 'payment',
    ref_id: subscriptionId,
    idempotency_key: idempKey,
    metadata_json: { plan_code: planCode, period_end: periodEnd },
  })
}

async function getProjectId(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<string> {
  const { data } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', userId)
    .neq('status', 'archived')
    .single()
  return data!.id
}
