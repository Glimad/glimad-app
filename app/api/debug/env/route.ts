import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY?.slice(0, 20) ?? 'NOT SET',
    STRIPE_PRICE_BASE: process.env.STRIPE_PRICE_BASE ?? 'NOT SET',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20) ?? 'NOT SET',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'NOT SET',
  })
}
