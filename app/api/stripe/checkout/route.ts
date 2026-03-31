import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/extract-token'
import { NextResponse } from 'next/server'

const STRIPE_API = 'https://api.stripe.com/v1'

function stripeHeaders() {
  return {
    'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
}

function toForm(obj: Record<string, string | Record<string, string>>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        parts.push(`${encodeURIComponent(`${k}[${sk}]`)}=${encodeURIComponent(sv)}`)
      }
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    }
  }
  return parts.join('&')
}

export async function POST(request: Request) {
  const { plan_code } = await request.json()

  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

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
    const res = await fetch(`${STRIPE_API}/customers`, {
      method: 'POST',
      headers: stripeHeaders(),
      body: toForm({
        email: user.email!,
        'metadata[user_id]': user.id,
      }),
    })
    const customer = await res.json()
    customerId = customer.id
    await admin.from('core_stripe_customers').insert({
      user_id: user.id,
      stripe_customer_id: customerId,
    })
  }

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: stripeHeaders(),
    body: toForm({
      customer: customerId!,
      client_reference_id: user.id,
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'metadata[user_id]': user.id,
      'metadata[plan_code]': plan_code,
      success_url: `${origin}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscribe`,
    }),
  })
  const session = await res.json()

  return NextResponse.json({ url: session.url })
}
