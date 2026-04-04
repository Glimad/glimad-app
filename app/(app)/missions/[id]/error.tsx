'use client'

import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n'

export default function MissionError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  console.error('[Mission error]', error)
  const router = useRouter()
  const t = useT('common.errors')

  return (
    <div className="text-white min-h-96 flex items-center justify-center">
      <div className="text-center max-w-md">
        <p className="text-xl font-semibold mb-2">{t('mission_title')}</p>
        <p className="text-zinc-500 text-sm mb-6">{t('mission_sub')}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors"
          >
            {t('try_again')}
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-5 py-2.5 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-semibold text-sm transition-colors"
          >
            {t('back_dashboard')}
          </button>
        </div>
      </div>
    </div>
  )
}
