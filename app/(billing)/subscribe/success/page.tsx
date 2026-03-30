'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SubscribeSuccessPage() {
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
          <p className="text-white text-lg font-medium mb-2">Taking longer than expected...</p>
          <p className="text-zinc-400 text-sm mb-6">Your payment was received. It may take a minute to activate.</p>
          <button
            onClick={() => router.replace('/dashboard')}
            className="px-6 py-2 bg-white text-black rounded-lg font-medium mr-3"
          >
            Go to Dashboard
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 border border-zinc-600 text-white rounded-lg font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white text-lg font-medium">Activating your plan...</p>
        <p className="text-zinc-400 text-sm mt-2">This takes just a moment.</p>
      </div>
    </div>
  )
}
