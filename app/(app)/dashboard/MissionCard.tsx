'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface MissionTemplate {
  template_code: string
  name: string
  description: string
  type: string
}

interface ActiveInstance {
  id: string
  status: string
}

interface Props {
  template: MissionTemplate
  activeInstance: ActiveInstance | null
  t: {
    start: string
    resume: string
    types: Record<string, string>
    waiting: string
    in_progress: string
  }
}

const TYPE_ICONS: Record<string, string> = {
  discovery: '🔍',
  planning: '🗺️',
  execution: '⚡',
  analysis: '📊',
  rescue: '🚑',
}

export default function MissionCard({ template, activeInstance, t }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleStart() {
    setLoading(true)

    if (activeInstance) {
      router.push(`/missions/${activeInstance.id}`)
      return
    }

    const res = await fetch('/api/missions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_code: template.template_code }),
    })
    const data = await res.json()

    if (data.instance_id) {
      router.push(`/missions/${data.instance_id}`)
    }
    setLoading(false)
  }

  const typeLabel = t.types[template.type] ?? template.type
  const typeIcon = TYPE_ICONS[template.type] ?? '📋'

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden hover:border-violet-700 transition-colors">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{typeIcon}</span>
              <span className="text-xs text-zinc-500 uppercase tracking-wide">{typeLabel}</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">{template.name}</h3>
            <p className="text-sm text-zinc-400">{template.description}</p>
          </div>

          <button
            onClick={handleStart}
            disabled={loading}
            className="shrink-0 px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {loading ? '...' : activeInstance ? t.resume : t.start}
          </button>
        </div>

        {activeInstance && (
          <div className="mt-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
            <span className="text-xs text-violet-400">
              {activeInstance.status === 'needs_user_input' ? t.waiting : t.in_progress}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
