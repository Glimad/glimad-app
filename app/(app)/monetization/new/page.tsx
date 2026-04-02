'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const PRODUCT_TYPES = [
  { value: 'service', label: 'Service' },
  { value: 'digital_product', label: 'Digital Product' },
  { value: 'membership', label: 'Membership' },
  { value: 'affiliate', label: 'Affiliate' },
  { value: 'brand_deal', label: 'Brand Deal' },
  { value: 'course', label: 'Course' },
]

export default function NewProductPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const form = new FormData(e.currentTarget)
    await fetch('/api/monetization/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        type: form.get('type'),
        price_amount: form.get('price_amount') ? Number(form.get('price_amount')) : null,
        price_currency: form.get('price_currency') || 'EUR',
        platform: form.get('platform') || null,
        url: form.get('url') || null,
        notes: form.get('notes') || null,
        status: 'active',
      }),
    })
    router.push('/monetization')
  }

  return (
    <div className="text-white max-w-xl mx-auto px-4 pt-8 pb-12">
      <h1 className="text-2xl font-bold mb-2">Add Revenue Stream</h1>
      <p className="text-zinc-500 text-sm mb-8">Add a product or service you offer to your audience</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Name</label>
          <input
            name="name"
            required
            placeholder="e.g. 1:1 Coaching Session"
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Type</label>
          <select
            name="type"
            required
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-violet-500"
          >
            {PRODUCT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-zinc-300 mb-1">Price</label>
            <input
              name="price_amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="49.00"
              className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div className="w-28">
            <label className="block text-sm font-medium text-zinc-300 mb-1">Currency</label>
            <select
              name="price_currency"
              className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-violet-500"
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Platform (optional)</label>
          <input
            name="platform"
            placeholder="e.g. gumroad, patreon, instagram"
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">URL (optional)</label>
          <input
            name="url"
            type="url"
            placeholder="https://..."
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Notes (optional)</label>
          <textarea
            name="notes"
            rows={3}
            placeholder="Additional details about this product..."
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push('/monetization')}
            className="flex-1 px-5 py-3 rounded-lg border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-semibold text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-5 py-3 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold text-sm"
          >
            {saving ? 'Saving...' : 'Add Product'}
          </button>
        </div>
      </form>
    </div>
  )
}
