'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import { useRouter } from 'next/navigation'

interface CalendarItem {
  id: string
  content_type: string
  platform: string | null
  status: 'draft' | 'scheduled' | 'published' | 'failed' | 'paused'
  scheduled_at: string | null
  created_at: string
  core_assets: { content: Record<string, unknown> } | null
  core_outputs: { content: Record<string, unknown> } | null
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-900 text-blue-300 border-blue-700',
  published: 'bg-green-900 text-green-300 border-green-700',
  failed: 'bg-red-900 text-red-300 border-red-700',
  draft: 'bg-zinc-800 text-zinc-400 border-zinc-600',
  paused: 'bg-yellow-900 text-yellow-300 border-yellow-700',
}

const STATUS_DOTS: Record<string, string> = {
  scheduled: 'bg-blue-400',
  published: 'bg-green-400',
  failed: 'bg-red-400',
  draft: 'bg-zinc-500',
  paused: 'bg-yellow-400',
}

export default function CalendarPage() {
  const t = useT('calendar')
  const router = useRouter()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [items, setItems] = useState<CalendarItem[]>([])
  const [drafts, setDrafts] = useState<CalendarItem[]>([])
  const [selected, setSelected] = useState<CalendarItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [rescheduling, setRescheduling] = useState(false)
  const [newScheduledAt, setNewScheduledAt] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    fetch(`/api/calendar?month=${monthStr}`)
      .then(async r => {
        if (!r.ok) throw new Error('Failed to load calendar')
        return r.json()
      })
      .then(data => {
        setItems(data.items ?? [])
        setDrafts(data.drafts ?? [])
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load calendar')
        setLoading(false)
      })
  }, [year, month])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay()

  function getItemsForDay(day: number) {
    return items.filter(item => {
      if (!item.scheduled_at) return false
      const d = new Date(item.scheduled_at)
      return d.getFullYear() === year && d.getMonth() + 1 === month && d.getDate() === day
    })
  }

  async function updateStatus(itemId: string, status: string) {
    setUpdatingId(itemId)
    const res = await fetch(`/api/calendar/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const data = await res.json()
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: data.item.status } : i))
    setDrafts(prev => prev.map(i => i.id === itemId ? { ...i, status: data.item.status } : i))
    if (selected?.id === itemId) setSelected(prev => prev ? { ...prev, status: data.item.status } : null)
    setUpdatingId(null)
  }

  async function saveReschedule(itemId: string) {
    setUpdatingId(itemId)
    const scheduled_at = newScheduledAt ? new Date(newScheduledAt).toISOString() : null
    const body: Record<string, unknown> = { scheduled_at }
    if (selected?.status === 'draft' && scheduled_at) body.status = 'scheduled'
    const res = await fetch(`/api/calendar/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    const updated = data.item
    setItems(prev => {
      const exists = prev.find(i => i.id === itemId)
      if (exists) return prev.map(i => i.id === itemId ? { ...i, ...updated } : i)
      if (updated.scheduled_at) return [...prev, { ...selected!, ...updated }]
      return prev
    })
    setDrafts(prev => prev.filter(i => i.id !== itemId))
    if (selected?.id === itemId) setSelected(prev => prev ? { ...prev, ...updated } : null)
    setRescheduling(false)
    setNewScheduledAt('')
    setUpdatingId(null)
  }

  async function deleteItem(itemId: string) {
    await fetch(`/api/calendar/${itemId}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.id !== itemId))
    setDrafts(prev => prev.filter(i => i.id !== itemId))
    setSelected(null)
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })
  const dayHeaders = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, i).toLocaleString(undefined, { weekday: 'short' })
  )

  const STATUS_LABELS: Record<string, string> = {
    draft: t('state_draft'),
    scheduled: t('state_scheduled'),
    published: t('state_published'),
    failed: t('state_failed'),
    paused: t('state_paused'),
  }

  return (
    <div className="text-white max-w-5xl mx-auto px-4 pt-8 pb-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-zinc-400 text-sm mt-1">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => router.push('/studio')}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
        >
          + {t('create_content')}
        </button>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-zinc-800 transition-colors">←</button>
        <h2 className="text-lg font-semibold min-w-32 text-center capitalize">{monthLabel}</h2>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-zinc-800 transition-colors">→</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-zinc-400">{t('loading')}</div>
      ) : error ? (
        <div className="flex items-center justify-center py-24 text-red-400 text-sm">Could not load calendar data.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-7 gap-px bg-zinc-800 rounded-xl overflow-hidden">
              {dayHeaders.map(d => (
                <div key={d} className="bg-zinc-900 text-xs text-zinc-500 text-center py-2">{d}</div>
              ))}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-zinc-900 h-20" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dayItems = getItemsForDay(day)
                const isToday = year === now.getFullYear() && month === now.getMonth() + 1 && day === now.getDate()
                return (
                  <div key={day} className="bg-zinc-900 h-20 p-1.5">
                    <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-violet-600 text-white' : 'text-zinc-400'}`}>
                      {day}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayItems.slice(0, 2).map(item => (
                        <button
                          key={item.id}
                          onClick={() => { setSelected(item); setRescheduling(false) }}
                          className={`w-full text-left text-xs px-1.5 py-0.5 rounded truncate flex items-center gap-1 border ${STATUS_COLORS[item.status]}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOTS[item.status]}`} />
                          {item.content_type}
                        </button>
                      ))}
                      {dayItems.length > 2 && (
                        <p className="text-xs text-zinc-500 px-1">+{dayItems.length - 2}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {drafts.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-zinc-400 mb-3">{t('drafts_title')}</h3>
                <div className="space-y-2">
                  {drafts.map(item => (
                    <button
                      key={item.id}
                      onClick={() => { setSelected(item); setRescheduling(false) }}
                      className={`w-full text-left px-4 py-3 rounded-xl border flex items-center gap-3 transition-colors hover:border-zinc-600 ${STATUS_COLORS['draft']}`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOTS['draft']}`} />
                      <span className="text-sm flex-1 capitalize">{item.content_type.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-zinc-500">{t('state_draft')}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            {selected ? (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 sticky top-4">
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${STATUS_COLORS[selected.status]}`}>
                    {STATUS_LABELS[selected.status] ?? selected.status}
                  </span>
                  <button onClick={() => { setSelected(null); setRescheduling(false) }} className="text-zinc-500 hover:text-zinc-300 text-sm">✕</button>
                </div>

                <p className="text-sm font-semibold mb-1 capitalize">{selected.content_type.replace(/_/g, ' ')}</p>
                {selected.platform && <p className="text-xs text-zinc-500 mb-3">{selected.platform}</p>}

                {selected.scheduled_at && !rescheduling && (
                  <p className="text-xs text-zinc-400 mb-4">
                    📅 {new Date(selected.scheduled_at).toLocaleString()}
                  </p>
                )}

                {(selected.core_assets?.content ?? selected.core_outputs?.content) && (
                  <div className="bg-zinc-800 rounded-lg p-3 mb-4">
                    <p className="text-xs text-zinc-500 mb-1">{t('hook')}</p>
                    <p className="text-sm text-zinc-200 line-clamp-3">
                      {String(((selected.core_assets?.content ?? selected.core_outputs?.content) as Record<string, unknown>).hook ?? '')}
                    </p>
                  </div>
                )}

                {rescheduling ? (
                  <div className="mb-4 space-y-3">
                    <input
                      type="datetime-local"
                      value={newScheduledAt}
                      onChange={e => setNewScheduledAt(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveReschedule(selected.id)}
                        disabled={!newScheduledAt || !!updatingId}
                        className="flex-1 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium disabled:opacity-40 transition-colors"
                      >
                        {updatingId === selected.id ? '...' : t('save_reschedule')}
                      </button>
                      <button
                        onClick={() => { setRescheduling(false); setNewScheduledAt('') }}
                        className="px-3 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-sm transition-colors hover:border-zinc-500"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selected.status === 'scheduled' && (
                      <>
                        <button
                          onClick={() => updateStatus(selected.id, 'published')}
                          disabled={!!updatingId}
                          className="w-full py-2 rounded-lg bg-green-800 hover:bg-green-700 text-green-200 text-sm font-medium disabled:opacity-40 transition-colors"
                        >
                          {updatingId === selected.id ? '...' : t('mark_published')}
                        </button>
                        <button
                          onClick={() => { setRescheduling(true); setNewScheduledAt('') }}
                          disabled={!!updatingId}
                          className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium disabled:opacity-40 transition-colors"
                        >
                          {t('reschedule')}
                        </button>
                        <button
                          onClick={() => updateStatus(selected.id, 'paused')}
                          disabled={!!updatingId}
                          className="w-full py-2 rounded-lg bg-yellow-900 hover:bg-yellow-800 text-yellow-200 text-sm font-medium disabled:opacity-40 transition-colors"
                        >
                          {t('pause')}
                        </button>
                      </>
                    )}
                    {selected.status === 'draft' && (
                      <button
                        onClick={() => { setRescheduling(true); setNewScheduledAt('') }}
                        disabled={!!updatingId}
                        className="w-full py-2 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-sm font-medium disabled:opacity-40 transition-colors"
                      >
                        {t('approve')}
                      </button>
                    )}
                    {selected.status === 'paused' && (
                      <button
                        onClick={() => updateStatus(selected.id, 'scheduled')}
                        disabled={!!updatingId}
                        className="w-full py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-blue-200 text-sm font-medium disabled:opacity-40 transition-colors"
                      >
                        {updatingId === selected.id ? '...' : t('resume')}
                      </button>
                    )}
                    {selected.status === 'failed' && (
                      <>
                        <button
                          onClick={() => updateStatus(selected.id, 'scheduled')}
                          disabled={!!updatingId}
                          className="w-full py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-blue-200 text-sm font-medium disabled:opacity-40 transition-colors"
                        >
                          {updatingId === selected.id ? '...' : t('retry')}
                        </button>
                        <button
                          onClick={() => { setRescheduling(true); setNewScheduledAt('') }}
                          disabled={!!updatingId}
                          className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium disabled:opacity-40 transition-colors"
                        >
                          {t('reschedule')}
                        </button>
                      </>
                    )}
                    {selected.status !== 'published' && (
                      <button
                        onClick={() => deleteItem(selected.id)}
                        className="w-full py-2 rounded-lg bg-red-950 hover:bg-red-900 text-red-300 text-sm font-medium transition-colors"
                      >
                        {t('delete')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 text-center">
                <p className="text-zinc-500 text-sm">{t('select_item')}</p>
                {items.length === 0 && drafts.length === 0 && (
                  <div className="mt-6">
                    <p className="text-zinc-400 text-sm mb-4">{t('empty_calendar')}</p>
                    <button
                      onClick={() => router.push('/studio')}
                      className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
                    >
                      {t('create_first')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
