'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const EVENT_TYPES = [
  { value: 'sale', label: 'Sale' },
  { value: 'refund', label: 'Refund' },
  { value: 'subscription_start', label: 'Subscription Start' },
  { value: 'subscription_cancel', label: 'Subscription Cancel' },
  { value: 'lead', label: 'Lead' },
  { value: 'inquiry', label: 'Inquiry' },
]

export default function AddEventForm({ productId }: { productId: string }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const form = new FormData(e.currentTarget)
    await fetch('/api/monetization/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        event_type: form.get('event_type'),
        amount: Number(form.get('amount') ?? 0),
        currency: form.get('currency') || 'EUR',
        note: form.get('note') || null,
        event_date: form.get('event_date') || new Date().toISOString().substring(0, 10),
        source: 'manual',
      }),
    })
    router.refresh()
    setSaving(false)
    ;(e.target as HTMLFormElement).reset()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">Type</label>
          <select
            name="event_type"
            required
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-violet-500"
          >
            {EVENT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Amount</label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            className="w-28 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Date</label>
          <input
            name="event_date"
            type="date"
            defaultValue={new Date().toISOString().substring(0, 10)}
            className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-violet-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Note (optional)</label>
        <input
          name="note"
          placeholder="e.g. client name, campaign..."
          className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500"
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold"
      >
        {saving ? 'Saving...' : 'Log Event'}
      </button>
    </form>
  )
}
