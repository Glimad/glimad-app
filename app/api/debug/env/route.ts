import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Stripe from 'stripe'

export async function GET() {
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? ''
  const priceBase = process.env.STRIPE_PRICE_BASE ?? ''

  let stripeTest = 'not tested'
  if (stripeKey && priceBase) {
    const stripe = new Stripe(stripeKey)
    const price = await stripe.prices.retrieve(priceBase)
    stripeTest = `OK — ${price.id} active=${price.active}`
  }

  const admin = createAdminClient()
  const { data: plans } = await admin.from('core_plans').select('plan_code').limit(1)
  const adminTest = plans ? `OK — ${JSON.stringify(plans)}` : 'FAILED'

  return NextResponse.json({
    STRIPE_SECRET_KEY: stripeKey.slice(0, 20) || 'NOT SET',
    STRIPE_PRICE_BASE: priceBase || 'NOT SET',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20) ?? 'NOT SET',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'NOT SET',
    stripeTest,
    adminTest,
  })
}
