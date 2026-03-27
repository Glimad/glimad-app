'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SubscribeSuccessPage() {
  const router = useRouter()

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
      }
    }

    poll()
  }, [router])

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
