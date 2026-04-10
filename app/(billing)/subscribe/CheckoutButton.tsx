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
      className="w-full py-3 font-semibold text-white transition-opacity disabled:opacity-40"
      style={{
        background: 'linear-gradient(to right, #00C9A7, #48CAE4)',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 600,
      }}
    >
      {loading ? t('processing') : t('cta')}
    </button>
  )
}
