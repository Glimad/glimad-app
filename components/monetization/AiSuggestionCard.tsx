'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n'

interface Suggestion {
  product_type: string
  name: string
  rationale: string
  suggested_price: number
  suggested_platform: string
  prefill_fields: Record<string, string>
}

export default function AiSuggestionCard() {
  const t = useT('monetization')
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)

  async function handleGenerate() {
    setLoading(true)
    const res = await fetch('/api/monetization/suggest', { method: 'POST' })
    const json = await res.json()
    setSuggestion(json.suggestion ?? null)
    setLoading(false)
  }

  function handleCreate() {
    if (!suggestion) return
    const params = new URLSearchParams({
      name: suggestion.name,
      type: suggestion.product_type,
      price_amount: String(suggestion.suggested_price),
      platform: suggestion.suggested_platform,
      notes: suggestion.prefill_fields?.notes ?? '',
    })
    router.push(`/monetization/new?${params.toString()}`)
  }

  if (!suggestion) {
    return (
      <div className="mb-8 bg-violet-950/40 border border-violet-800/50 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">{t('suggestion_heading')}</p>
          <p className="text-xs text-zinc-400 mt-0.5">{t('suggestion_sub')}</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="shrink-0 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold"
        >
          {loading ? t('suggestion_loading') : t('suggestion_cta')}
        </button>
      </div>
    )
  }

  return (
    <div className="mb-8 bg-zinc-900 border border-violet-700/50 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-xs text-violet-400 font-medium mb-1">{t('suggestion_label')}</p>
          <p className="text-base font-bold text-white">{suggestion.name}</p>
          <p className="text-xs text-zinc-500 capitalize mt-0.5">{suggestion.product_type.replace('_', ' ')} · €{suggestion.suggested_price} · {suggestion.suggested_platform}</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300"
        >
          {t('suggestion_regenerate')}
        </button>
      </div>
      <p className="text-sm text-zinc-400 mb-4">{suggestion.rationale}</p>
      <button
        onClick={handleCreate}
        className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
      >
        {t('suggestion_create')}
      </button>
    </div>
  )
}
