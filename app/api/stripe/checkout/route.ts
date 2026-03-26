import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

function extractToken(request: Request): string | null {
  const cookie = request.headers.get('cookie') ?? ''
  // Supabase SSR stores as: sb-<ref>-auth-token=base64-<json>
  const match = cookie.match(/sb-awaakurvnngazmnnmwza-auth-token=base64-([^;]+)/)
  if (!match) return null
  const decoded = Buffer.from(match[1], 'base64').toString('utf-8')
  const parsed = JSON.parse(decoded)
  return parsed.access_token ?? null
}

export async function POST(request: Request) {
  const { plan_code } = await request.json()

  const token = extractToken(request)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: { user } } = await admin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

  const PRICE_MAP: Record<string, string> = {
    BASE:  process.env.STRIPE_PRICE_BASE!,
    PRO:   process.env.STRIPE_PRICE_PRO!,
    ELITE: process.env.STRIPE_PRICE_ELITE!,
  }

  const priceId = PRICE_MAP[plan_code]
  const origin = new URL(request.url).origin

  const { data: existing } = await admin
    .from('core_stripe_customers')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single()

  let customerId = existing?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    })
    customerId = customer.id
    await admin.from('core_stripe_customers').insert({
      user_id: user.id,
      stripe_customer_id: customerId,
    })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: user.id,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { user_id: user.id, plan_code },
    success_url: `${origin}/en/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/en/subscribe`,
  })

  return NextResponse.json({ url: session.url })
}
