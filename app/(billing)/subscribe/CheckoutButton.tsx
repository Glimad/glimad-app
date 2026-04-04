'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n'

export default function CheckoutButton({ planCode }: { planCode: string }) {
  const t = useT('subscribe')
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_code: planCode }),
    })
    const { url } = await res.json()
    window.location.href = url
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full py-3 rounded-lg bg-white text-black font-semibold hover:bg-zinc-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? t('processing') : t('cta')}
    </button>
  )
}
