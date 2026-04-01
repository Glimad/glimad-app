'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface MissionNode {
  template_code: string
  name: string
  description: string
  type: string
  estimated_minutes: number | null
  xp_reward: number
  credit_cost_premium: number
  credit_cost_allowance: number
  status: 'completed' | 'active' | 'available' | 'locked'
  lock_reason?: string
  instance_id?: string
}

interface Props {
  missions: MissionNode[]
  t: {
    start: string
    resume: string
    active: string
    completed: string
    locked: string
    xp: string
    min: string
    credits: string
    credit_allowance: string
    credit_premium: string
    types: Record<string, string>
  }
}

const STATUS_STYLES: Record<MissionNode['status'], string> = {
  completed: 'border-zinc-700 bg-zinc-900/50 opacity-60',
  active: 'border-violet-500 bg-violet-950/40 shadow-violet-500/20 shadow-lg',
  available: 'border-zinc-600 bg-zinc-900 hover:border-zinc-400 cursor-pointer',
  locked: 'border-zinc-800 bg-zinc-900/30 opacity-40',
}

const STATUS_ICON: Record<MissionNode['status'], string> = {
  completed: '✓',
  active: '◉',
  available: '▶',
  locked: '🔒',
}

export default function MissionMap({ missions, t }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [starting, setStarting] = useState<string | null>(null)
  const router = useRouter()

  async function startMission(templateCode: string) {
    setStarting(templateCode)
    const resp = await fetch('/api/missions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_code: templateCode }),
    })
    const { instance_id } = await resp.json()
    router.push(`/missions/${instance_id}`)
  }

  function resumeMission(instanceId: string) {
    router.push(`/missions/${instanceId}`)
  }

  return (
    <div className="relative">
      {/* Path line */}
      <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-zinc-800" />

      <div className="space-y-3">
        {missions.map((mission) => (
          <div key={mission.template_code} className="relative flex gap-4">
            {/* Node dot */}
            <div className={`relative z-10 flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center text-sm font-bold
              ${mission.status === 'completed' ? 'border-green-700 bg-green-950 text-green-400' :
                mission.status === 'active' ? 'border-violet-500 bg-violet-950 text-violet-300 animate-pulse' :
                mission.status === 'available' ? 'border-zinc-500 bg-zinc-900 text-zinc-300' :
                'border-zinc-700 bg-zinc-900 text-zinc-600'}
            `}>
              {STATUS_ICON[mission.status]}
            </div>

            {/* Glimy fox next to current mission */}
            {mission.status === 'active' && (
              <div className="absolute -left-1 top-0 text-xl">🦊</div>
            )}

            {/* Mission card */}
            <div
              className={`flex-1 rounded-xl border p-4 transition-all ${STATUS_STYLES[mission.status]}`}
              onClick={() => {
                if (mission.status === 'available') setSelected(
                  selected === mission.template_code ? null : mission.template_code
                )
                if (mission.status === 'active' && mission.instance_id) resumeMission(mission.instance_id)
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {t.types[mission.type] ?? mission.type}
                    </span>
                    {mission.status === 'active' && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-violet-900 text-violet-300 font-medium">
                        {t.active}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-white leading-snug">{mission.name}</h3>
                  {mission.status === 'locked' && mission.lock_reason && (
                    <p className="text-xs text-zinc-600 mt-0.5">{mission.lock_reason}</p>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs text-violet-400 font-semibold">+{mission.xp_reward} {t.xp}</div>
                  {mission.estimated_minutes && (
                    <div className="text-xs text-zinc-600">{mission.estimated_minutes}{t.min}</div>
                  )}
                </div>
              </div>

              {/* Expanded action panel for available missions */}
              {selected === mission.template_code && mission.status === 'available' && (
                <div className="mt-3 pt-3 border-t border-zinc-700">
                  <p className="text-xs text-zinc-400 mb-3">{mission.description}</p>
                  {(mission.credit_cost_allowance > 0 || mission.credit_cost_premium > 0) && (
                    <p className="text-xs text-zinc-500 mb-2">
                      {t.credits}: {mission.credit_cost_allowance > 0 ? `${mission.credit_cost_allowance} ${t.credit_allowance}` : ''}{mission.credit_cost_premium > 0 ? `${mission.credit_cost_premium} ${t.credit_premium}` : ''}
                    </p>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); startMission(mission.template_code) }}
                    disabled={starting === mission.template_code}
                    className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                  >
                    {starting === mission.template_code ? '...' : t.start}
                  </button>
                </div>
              )}

              {/* Active mission: resume button */}
              {mission.status === 'active' && mission.instance_id && (
                <div className="mt-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); resumeMission(mission.instance_id!) }}
                    className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
                  >
                    {t.resume}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
