'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function MarkReadButton({ ids }: { ids: string[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function markAllRead() {
    setLoading(true)
    await Promise.all(
      ids.map(id =>
        fetch(`/api/notifications/${id}`, { method: 'PATCH' })
      )
    )
    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={markAllRead}
      disabled={loading}
      className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50 transition-colors"
    >
      {loading ? 'Marking...' : 'Mark all read'}
    </button>
  )
}
