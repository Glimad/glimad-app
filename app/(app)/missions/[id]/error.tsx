'use client'

import { useRouter } from 'next/navigation'

export default function MissionError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  console.error('[Mission error]', error)
  const router = useRouter()

  return (
    <div className="text-white min-h-96 flex items-center justify-center">
      <div className="text-center max-w-md">
        <p className="text-xl font-semibold mb-2">Mission couldn&apos;t load</p>
        <p className="text-zinc-500 text-sm mb-6">
          Your progress is saved. You can retry or return to the dashboard.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-5 py-2.5 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-semibold text-sm transition-colors"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
