'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n'

export default function SubscribeSuccessPage() {
  const t = useT('subscribe')
  const router = useRouter()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    let attempts = 0

    async function poll() {
      attempts++
      const res = await fetch('/api/me/access')
      const data = await res.json()

      if (data.access_state === 'active') {
        router.replace('/dashboard')
        return
      }

      if (attempts < 20) {
        setTimeout(poll, 3000)
      } else {
        setTimedOut(true)
      }
    }

    poll()
  }, [router])

  if (timedOut) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg font-medium mb-2">{t('timeout_title')}</p>
          <p className="text-zinc-400 text-sm mb-6">{t('timeout_sub')}</p>
          <button
            onClick={() => router.replace('/dashboard')}
            className="px-6 py-2 bg-white text-black rounded-lg font-medium mr-3"
          >
            {t('go_dashboard')}
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 border border-zinc-600 text-white rounded-lg font-medium"
          >
            {t('retry')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white text-lg font-medium">{t('activating')}</p>
        <p className="text-zinc-400 text-sm mt-2">{t('activating_sub')}</p>
      </div>
    </div>
  )
}
