'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useT } from '@/lib/i18n'

export default function NewProductPage() {
  const t = useT('monetization')
  const router = useRouter()
  const searchParams = useSearchParams()
  const [saving, setSaving] = useState(false)

  const prefill = {
    name: searchParams.get('name') ?? '',
    type: searchParams.get('type') ?? 'service',
    price_amount: searchParams.get('price_amount') ?? '',
    platform: searchParams.get('platform') ?? '',
    notes: searchParams.get('notes') ?? '',
  }

  const PRODUCT_TYPES = [
    { value: 'service',          label: t('product_types.service') },
    { value: 'digital_product',  label: t('product_types.digital_product') },
    { value: 'membership',       label: t('product_types.membership') },
    { value: 'affiliate',        label: t('product_types.affiliate') },
    { value: 'brand_deal',       label: t('product_types.brand_deal') },
    { value: 'course',           label: t('product_types.course') },
  ]

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
      <h1 className="text-2xl font-bold mb-2">{t('new_title')}</h1>
      <p className="text-zinc-500 text-sm mb-8">{t('new_subtitle')}</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">{t('form_name')}</label>
          <input
            name="name"
            required
            defaultValue={prefill.name}
            placeholder={t('form_name_placeholder')}
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">{t('form_type')}</label>
          <select
            name="type"
            required
            defaultValue={prefill.type}
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-violet-500"
          >
            {PRODUCT_TYPES.map(pt => (
              <option key={pt.value} value={pt.value}>{pt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-zinc-300 mb-1">{t('form_price')}</label>
            <input
              name="price_amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={prefill.price_amount}
              placeholder="49.00"
              className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div className="w-28">
            <label className="block text-sm font-medium text-zinc-300 mb-1">{t('form_currency')}</label>
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
          <label className="block text-sm font-medium text-zinc-300 mb-1">{t('form_platform')}</label>
          <input
            name="platform"
            defaultValue={prefill.platform}
            placeholder={t('form_platform_placeholder')}
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">{t('form_url')}</label>
          <input
            name="url"
            type="url"
            placeholder="https://..."
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">{t('form_notes')}</label>
          <textarea
            name="notes"
            rows={3}
            defaultValue={prefill.notes}
            placeholder={t('form_notes_placeholder')}
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push('/monetization')}
            className="flex-1 px-5 py-3 rounded-lg border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-semibold text-sm"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-5 py-3 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold text-sm"
          >
            {saving ? t('saving') : t('add_product_btn')}
          </button>
        </div>
      </form>
    </div>
  )
}
