import type { PulseRun } from '@/lib/pulse'

const PRIORITY_COLORS = {
  high: 'text-red-400 border-red-800 bg-red-950/40',
  medium: 'text-amber-400 border-amber-800 bg-amber-950/40',
  low: 'text-zinc-400 border-zinc-700 bg-zinc-900/40',
}

const CATEGORY_ICONS: Record<string, string> = {
  content: '🎬',
  consistency: '📅',
  growth: '📈',
  engagement: '💬',
}

interface TimeLabels {
  justNow: string
  hoursAgo: (h: number) => string
  daysAgo: (d: number) => string
}

function timeAgo(dateStr: string, labels: TimeLabels): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffH < 1) return labels.justNow
  if (diffH < 24) return labels.hoursAgo(diffH)
  const diffD = Math.floor(diffH / 24)
  return labels.daysAgo(diffD)
}

interface Props {
  pulse: PulseRun | null
  t: {
    title: string
    refreshing: string
    noData: string
    noDataSub: string
    updated: string
    justNow: string
    hoursAgo: (h: number) => string
    daysAgo: (d: number) => string
    priorityLabels: Record<string, string>
  }
}

export default function DailyPulseCard({ pulse, t }: Props) {
  if (!pulse) {
    return (
      <div className="bg-zinc-900 rounded-xl p-8 border border-zinc-800 text-center">
        <p className="text-zinc-300 font-medium">{t.noData}</p>
        <p className="text-zinc-500 text-sm mt-1">{t.noDataSub}</p>
      </div>
    )
  }

  const isFresh = Date.now() - new Date(pulse.started_at).getTime() < 6 * 60 * 60 * 1000
  const actionItems = pulse.action_items ?? []

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden ${!isFresh ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <h3 className="text-sm font-semibold text-white">
          {t.title}
          {pulse.phase_code && (
            <span className="ml-2 text-xs text-zinc-500 font-normal">{pulse.phase_code}</span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {!isFresh && (
            <span className="text-xs text-zinc-500 italic">{t.refreshing}</span>
          )}
          <span className="text-xs text-zinc-500">{t.updated} {timeAgo(pulse.started_at, { justNow: t.justNow, hoursAgo: t.hoursAgo, daysAgo: t.daysAgo })}</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {actionItems.map((item, i) => (
          <div
            key={i}
            className={`rounded-lg border p-3 ${PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.low}`}
          >
            <div className="flex items-start gap-3">
              <span className="text-lg leading-none mt-0.5">{CATEGORY_ICONS[item.category] ?? '💡'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wide opacity-75">
                    {t.priorityLabels[item.priority] ?? item.priority}
                  </span>
                </div>
                <p className="text-sm font-medium text-white leading-snug">{item.action}</p>
                <p className="text-xs opacity-70 mt-1 leading-snug">{item.reasoning}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
