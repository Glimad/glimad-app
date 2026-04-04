'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n'

interface AdminStats {
  userOverview: {
    total: number
    completedOnboarding: number
    paid: number
    withMissions: number
  }
  missionAnalytics: Array<{
    template_code: string
    total: number
    completed: number
    completion_rate: number
    abandoned: number
    avg_minutes: number | null
  }>
  creditConsumption: Array<{
    reason_key: string
    allowance: number
    premium: number
    count: number
  }>
  abResults: Array<{
    variant: string
    total: number
    converted: number
    conversion_rate: number
  }>
  featureFlags: Array<{
    id: string
    flag_key: string
    enabled: boolean
    description: string | null
  }>
  errorLog: Array<{
    id: string
    template_code: string
    project_id: string
    created_at: string
  }>
}

export default function AdminPage() {
  const t = useT('admin')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => {
        if (r.status === 403) throw new Error('Forbidden')
        return r.json()
      })
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function toggleFlag(flagKey: string, currentEnabled: boolean) {
    setToggling(flagKey)
    await fetch('/api/admin/stats', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flag_key: flagKey, enabled: !currentEnabled }),
    })
    setStats(prev => prev ? {
      ...prev,
      featureFlags: prev.featureFlags.map(f =>
        f.flag_key === flagKey ? { ...f, enabled: !currentEnabled } : f
      ),
    } : prev)
    setToggling(null)
  }

  if (loading) return (
    <div className="text-white flex items-center justify-center min-h-96">
      <div className="text-zinc-500">{t('loading')}</div>
    </div>
  )

  if (error) return (
    <div className="text-white flex items-center justify-center min-h-96">
      <div className="text-center">
        <p className="text-red-400 font-medium mb-2">{t('access_denied')}</p>
        <p className="text-zinc-500 text-sm">{error}</p>
        <button onClick={() => router.push('/dashboard')} className="mt-4 text-violet-400 text-sm hover:underline">
          {t('back_dashboard')}
        </button>
      </div>
    </div>
  )

  if (!stats) return null

  return (
    <div className="text-white">
      <div className="max-w-6xl mx-auto px-4 pt-8 pb-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-zinc-500 text-sm mt-1">{t('subtitle')}</p>
        </div>

        {/* User Overview */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">{t('user_overview')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: t('total_users'), value: stats.userOverview.total },
              { label: t('completed_onboarding'), value: stats.userOverview.completedOnboarding },
              { label: t('paying_users'), value: stats.userOverview.paid },
              { label: t('users_with_missions'), value: stats.userOverview.withMissions },
            ].map(stat => (
              <div key={stat.label} className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                <p className="text-xs text-zinc-500 mb-1">{stat.label}</p>
                <p className="text-3xl font-bold text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* A/B Test Results */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">{t('ab_results')}</h2>
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">{t('variant')}</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">{t('sessions')}</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">{t('converted')}</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">{t('rate')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.abResults.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-zinc-600">{t('no_ab_data')}</td></tr>
                ) : stats.abResults.map(row => (
                  <tr key={row.variant} className="border-b border-zinc-800/50">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-300">{row.variant}</td>
                    <td className="px-4 py-3 text-right text-zinc-400">{row.total}</td>
                    <td className="px-4 py-3 text-right text-zinc-400">{row.converted}</td>
                    <td className="px-4 py-3 text-right font-semibold text-white">{row.conversion_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Mission Analytics */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">{t('mission_analytics')}</h2>
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">{t('mission')}</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">{t('total')}</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">{t('completed')}</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">{t('rate')}</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">{t('abandoned')}</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">{t('avg_time')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.missionAnalytics.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-zinc-600">{t('no_mission_data')}</td></tr>
                ) : stats.missionAnalytics.map(row => (
                  <tr key={row.template_code} className="border-b border-zinc-800/50">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-300">{row.template_code}</td>
                    <td className="px-4 py-3 text-right text-zinc-400">{row.total}</td>
                    <td className="px-4 py-3 text-right text-zinc-400">{row.completed}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${row.completion_rate >= 70 ? 'text-green-400' : row.completion_rate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                        {row.completion_rate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-500">{row.abandoned}</td>
                    <td className="px-4 py-3 text-right text-zinc-500">{row.avg_minutes != null ? `${row.avg_minutes}m` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Credit Consumption */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">{t('credit_consumption')}</h2>
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">{t('operation')}</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">{t('uses')}</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">{t('allowance')}</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">{t('premium')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.creditConsumption.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-zinc-600">{t('no_credit_data')}</td></tr>
                ) : stats.creditConsumption.map(row => (
                  <tr key={row.reason_key} className="border-b border-zinc-800/50">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-300">{row.reason_key}</td>
                    <td className="px-4 py-3 text-right text-zinc-400">{row.count}</td>
                    <td className="px-4 py-3 text-right text-zinc-500">{row.allowance}</td>
                    <td className="px-4 py-3 text-right text-zinc-500">{row.premium}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Feature Flags */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">{t('feature_flags')}</h2>
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 divide-y divide-zinc-800">
            {stats.featureFlags.length === 0 ? (
              <div className="px-4 py-6 text-center text-zinc-600">{t('no_flags')}</div>
            ) : stats.featureFlags.map(flag => (
              <div key={flag.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-mono text-zinc-300">{flag.flag_key}</p>
                  {flag.description && <p className="text-xs text-zinc-600 mt-0.5">{flag.description}</p>}
                </div>
                <button
                  onClick={() => toggleFlag(flag.flag_key, flag.enabled)}
                  disabled={toggling === flag.flag_key}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50
                    ${flag.enabled ? 'bg-violet-600' : 'bg-zinc-700'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${flag.enabled ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Error Log */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">{t('error_log')}</h2>
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 divide-y divide-zinc-800">
            {stats.errorLog.length === 0 ? (
              <div className="px-4 py-6 text-center text-zinc-600">{t('no_failures')}</div>
            ) : stats.errorLog.map(err => (
              <div key={err.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-mono text-xs text-red-400">{err.template_code}</span>
                  <span className="text-xs text-zinc-600">{new Date(err.created_at).toLocaleString()}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1 font-mono">{err.project_id}</p>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
