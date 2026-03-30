'use client'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  console.error('[Dashboard error]', error)

  return (
    <div className="text-white min-h-96 flex items-center justify-center">
      <div className="text-center max-w-md">
        <p className="text-xl font-semibold mb-2">Something went wrong</p>
        <p className="text-zinc-500 text-sm mb-6">
          We couldn&apos;t load your dashboard. This is usually temporary.
        </p>
        <button
          onClick={reset}
          className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
