'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function SignupPage() {
  const t = useTranslations('auth.signup')
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const sessionId = searchParams.get('sid')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
        data: {
          onboarding_session_id: sessionId ?? null,
        },
      },
    })
    router.push(`/${locale}/verify`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-md p-8 space-y-6">
        <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
        <p className="text-zinc-400">{t('subtitle')}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-300 mb-1">{t('email')}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-violet-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-300 mb-1">{t('password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-violet-500"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-semibold transition-colors"
          >
            {t('submit')}
          </button>
        </form>
        <p className="text-center text-zinc-400 text-sm">
          {t('login_link')}{' '}
          <Link href={`/${locale}/login`} className="text-violet-400 hover:text-violet-300">
            {t('login_cta')}
          </Link>
        </p>
      </div>
    </div>
  )
}
