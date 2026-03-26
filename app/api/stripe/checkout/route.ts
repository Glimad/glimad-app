import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const PRICE_MAP: Record<string, string> = {
  BASE:  process.env.STRIPE_PRICE_BASE!,
  PRO:   process.env.STRIPE_PRICE_PRO!,
  ELITE: process.env.STRIPE_PRICE_ELITE!,
}

export async function POST(request: Request) {
  const { plan_code } = await request.json()
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const priceId = PRICE_MAP[plan_code]
  const origin = new URL(request.url).origin

  // Get or create Stripe customer
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('core_stripe_customers')
    .select('stripe_customer_id')
    .eq('user_id', user!.id)
    .single()

  let customerId = existing?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user!.email,
      metadata: { user_id: user!.id },
    })
    customerId = customer.id
    await admin.from('core_stripe_customers').insert({
      user_id: user!.id,
      stripe_customer_id: customerId,
    })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: user!.id,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { user_id: user!.id, plan_code },
    success_url: `${origin}/es/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/es/subscribe`,
  })

  return NextResponse.json({ url: session.url })
}
