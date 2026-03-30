interface CalendarDay {
  date: string
  label: string
  dots: Array<{ state: string }>
}

interface Props {
  days: CalendarDay[]
}

const STATE_DOT: Record<string, string> = {
  scheduled: 'bg-blue-400',
  published: 'bg-green-400',
  failed: 'bg-red-400',
  draft: 'bg-zinc-500',
  paused: 'bg-amber-400',
}

export default function CalendarPreview({ days }: Props) {
  return (
    <a href="/calendar" className="block">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 px-4 py-3 hover:border-zinc-600 transition-colors">
        <div className="flex gap-1">
          {days.map(day => (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5">
              <span className="text-xs text-zinc-500">{day.label}</span>
              <div className="flex flex-col gap-0.5 min-h-6 items-center justify-center">
                {day.dots.length === 0 ? (
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
                ) : (
                  day.dots.slice(0, 3).map((dot, i) => (
                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${STATE_DOT[dot.state] ?? 'bg-zinc-600'}`} />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </a>
  )
}
