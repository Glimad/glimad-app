// Environment variables with fallbacks for deployment safety

export const env = {
  // Public variables (safe to expose to client)
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'https://glimad-app.vercel.app',
  
  // Server-only variables with fallbacks
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  CRON_SECRET: process.env.CRON_SECRET || 'fallback-cron-secret',
  DEFAULT_CURRENCY: process.env.DEFAULT_CURRENCY || 'EUR',
}

// Validation for required environment variables
export function validateEnv() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ANTHROPIC_API_KEY',
    'STRIPE_SECRET_KEY',
    'RESEND_API_KEY',
  ]
  
  const missing = required.filter(key => !env[key as keyof typeof env])
  
  if (missing.length > 0) {
    console.warn('Missing environment variables:', missing)
    return false
  }
  
  return true
}
