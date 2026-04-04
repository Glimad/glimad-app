'use client'

import { useT } from '@/lib/i18n'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  console.error('[Dashboard error]', error)
  const t = useT('common.errors')

  return (
    <div className="text-white min-h-96 flex items-center justify-center">
      <div className="text-center max-w-md">
        <p className="text-xl font-semibold mb-2">{t('dashboard_title')}</p>
        <p className="text-zinc-500 text-sm mb-6">{t('dashboard_sub')}</p>
        <button
          onClick={reset}
          className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors"
        >
          {t('try_again')}
        </button>
      </div>
    </div>
  )
}
