interface Stat {
  label: string
  value: string | number
  sub?: string
}

interface Props {
  stats: Stat[]
}

export default function QuickStats({ stats }: Props) {
  if (stats.length === 0) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((stat, i) => (
        <div key={i} className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">{stat.label}</p>
          <p className="text-xl font-bold text-white">{stat.value}</p>
          {stat.sub && <p className="text-xs text-zinc-600 mt-0.5">{stat.sub}</p>}
        </div>
      ))}
    </div>
  )
}
