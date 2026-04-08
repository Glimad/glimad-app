'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function VerifyPage() {
  const t = useT('auth.verify')
  const router = useRouter()
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Email confirmation disabled — user already has a session.
        // Non-blocking: redirect immediately to subscribe.
        setHasSession(true)
        router.replace('/subscribe')
      }
    })
  }, [router])

  if (hasSession) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-md p-8 space-y-4 text-center">
        <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
        <p className="text-zinc-400">{t('body')}</p>
        <p className="text-zinc-500 text-sm">{t('hint')}</p>
        <Link
          href="/subscribe"
          className="inline-block mt-4 text-violet-400 hover:text-violet-300 text-sm underline"
        >
          {t('skip')}
        </Link>
      </div>
    </div>
  )
}
