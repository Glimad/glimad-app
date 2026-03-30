import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { runPhaseEngine } from '@/lib/engines/phase-engine'
import { runInflexionEngine } from '@/lib/engines/inflexion-engine'
import { runPolicyEngine } from '@/lib/engines/policy-engine'
import { getLatestPulse } from '@/lib/pulse'
import { readAllFacts } from '@/lib/brain'
import MissionMap from './MissionMap'
import DailyPulseCard from './DailyPulseCard'
import CalendarPreview from './CalendarPreview'
import QuickStats from './QuickStats'
import AdminTrigger from './AdminTrigger'

const PHASE_COLORS: Record<string, string> = {
  F0: 'bg-zinc-700 text-zinc-200',
  F1: 'bg-blue-900 text-blue-200',
  F2: 'bg-indigo-900 text-indigo-200',
  F3: 'bg-violet-900 text-violet-200',
  F4: 'bg-purple-900 text-purple-200',
  F5: 'bg-pink-900 text-pink-200',
  F6: 'bg-rose-900 text-rose-200',
  F7: 'bg-amber-900 text-amber-200',
}

const PHASE_RANK: Record<string, number> = {
  F0: 0, F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7,
}

export default async function DashboardPage() {
  const t = await getTranslations('dashboard')

  const cookieStore = cookies()
  const authCookie = cookieStore.get('sb-awaakurvnngazmnnmwza-auth-token')
  const admin = createAdminClient()
  let user = null
  if (authCookie?.value?.startsWith('base64-')) {
    const session = JSON.parse(Buffer.from(authCookie.value.slice(7), 'base64').toString('utf-8'))
    if (session.access_token) {
      const { data } = await admin.auth.getUser(session.access_token)
      user = data.user
    }
  }

  if (!user) redirect('/login')

  const { data: project } = await admin
    .from('projects')
    .select('id, phase_code')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .single()

  if (!project) redirect('/onboarding')

  const [phaseResult, inflexion, wallet, latestPulse, facts] = await Promise.all([
    runPhaseEngine(admin, project.id),
    runInflexionEngine(admin, project.id),
    admin.from('core_wallets')
      .select('allowance_llm_balance, premium_credits_balance, plan_code')
      .eq('project_id', project.id)
      .single()
      .then(r => r.data),
    getLatestPulse(admin, project.id),
    readAllFacts(admin, project.id),
  ])

  const policy = await runPolicyEngine(admin, project.id, phaseResult, inflexion)

  // ── Mission map data ──────────────────────────────────────────────────────
  const [allTemplatesResult, completedInstancesResult, activeInstancesResult] = await Promise.all([
    admin.from('mission_templates')
      .select('template_code, name, description, type, estimated_minutes, xp_reward, credit_cost_premium, credit_cost_allowance, phase_min, phase_max, cooldown_hours')
      .eq('active', true),
    admin.from('mission_instances')
      .select('template_code, completed_at, id')
      .eq('project_id', project.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false }),
    admin.from('mission_instances')
      .select('template_code, status, id')
      .eq('project_id', project.id)
      .in('status', ['queued', 'running', 'waiting_input']),
  ])

  const allTemplates = allTemplatesResult.data ?? []
  const completedInstances = completedInstancesResult.data ?? []
  const activeInstances = activeInstancesResult.data ?? []

  const completedCodes = new Set(completedInstances.map(i => i.template_code))
  const activeMap = new Map(activeInstances.map(i => [i.template_code, i.id]))
  const completedMap = new Map(completedInstances.map(i => [i.template_code, i.id]))

  const currentRank = PHASE_RANK[phaseResult.phase] ?? 0

  // Sort: core flow first, then by phase relevance
  const CORE_FLOW = ['VISION_PURPOSE_MOODBOARD_V1', 'NICHE_CONFIRM_V1', 'PLATFORM_STRATEGY_PICKER_V1', 'PREFERENCES_CAPTURE_V1']

  const missionNodes = allTemplates
    .map(tmpl => {
      const minRank = tmpl.phase_min ? (PHASE_RANK[tmpl.phase_min] ?? 0) : 0
      const maxRank = tmpl.phase_max ? (PHASE_RANK[tmpl.phase_max] ?? 7) : 7

      let status: 'completed' | 'active' | 'available' | 'locked'
      let lock_reason: string | undefined

      if (activeMap.has(tmpl.template_code)) {
        status = 'active'
      } else if (completedCodes.has(tmpl.template_code)) {
        // Check if cooldown passed
        const lastCompleted = completedInstances.find(i => i.template_code === tmpl.template_code)?.completed_at
        const hoursAgo = lastCompleted
          ? (Date.now() - new Date(lastCompleted).getTime()) / 3600000
          : Infinity
        if (tmpl.cooldown_hours > 0 && hoursAgo < tmpl.cooldown_hours) {
          status = 'locked'
          const hoursLeft = Math.ceil(tmpl.cooldown_hours - hoursAgo)
          lock_reason = `Available again in ${hoursLeft}h`
        } else {
          status = 'completed'
        }
      } else if (currentRank < minRank || currentRank > maxRank) {
        status = 'locked'
        lock_reason = `Unlocks at phase F${minRank}`
      } else {
        status = 'available'
      }

      return {
        template_code: tmpl.template_code,
        name: tmpl.name,
        description: tmpl.description ?? '',
        type: tmpl.type,
        estimated_minutes: tmpl.estimated_minutes,
        xp_reward: tmpl.xp_reward ?? 50,
        credit_cost_premium: tmpl.credit_cost_premium,
        credit_cost_allowance: tmpl.credit_cost_allowance,
        status,
        lock_reason,
        instance_id: activeMap.get(tmpl.template_code) ?? completedMap.get(tmpl.template_code),
      }
    })
    .sort((a, b) => {
      const ORDER = { active: 0, available: 1, completed: 2, locked: 3 }
      if (ORDER[a.status] !== ORDER[b.status]) return ORDER[a.status] - ORDER[b.status]
      // Core flow first within same status
      const aCore = CORE_FLOW.indexOf(a.template_code)
      const bCore = CORE_FLOW.indexOf(b.template_code)
      if (aCore !== -1 && bCore !== -1) return aCore - bCore
      if (aCore !== -1) return -1
      if (bCore !== -1) return 1
      return 0
    })

  // ── Calendar preview (next 7 days) ───────────────────────────────────────
  const today = new Date()
  const next7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
  const endDate = next7[6] + 'T23:59:59Z'

  const { data: calendarItems } = await admin
    .from('core_calendar_items')
    .select('scheduled_at, state')
    .eq('project_id', project.id)
    .gte('scheduled_at', today.toISOString().slice(0, 10))
    .lte('scheduled_at', endDate)

  const calendarDays = next7.map(date => ({
    date,
    label: new Date(date + 'T12:00:00Z').toLocaleDateString('en', { weekday: 'short' }),
    dots: (calendarItems ?? [])
      .filter(item => item.scheduled_at?.startsWith(date))
      .map(item => ({ state: item.state ?? 'draft' })),
  }))

  // ── Quick stats ───────────────────────────────────────────────────────────
  const followerCount = facts['follower_count'] as number | null
  const engagementRate = facts['engagement_rate'] as number | null

  // Posts this week
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const { count: postsThisWeek } = await admin
    .from('core_calendar_items')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project.id)
    .eq('state', 'published')
    .gte('scheduled_at', weekAgo.toISOString())

  // Days until credit reset (approximate: 30 days from subscription creation)
  const { data: sub } = await admin
    .from('core_subscriptions')
    .select('current_period_end')
    .eq('project_id', project.id)
    .eq('status', 'active')
    .single()

  const daysToReset = sub?.current_period_end
    ? Math.max(0, Math.ceil((new Date(sub.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null

  const quickStats = [
    { label: t('stat_followers'), value: followerCount != null ? followerCount.toLocaleString() : t('no_stats') },
    { label: t('stat_engagement'), value: engagementRate != null ? `${engagementRate.toFixed(1)}%` : t('no_stats') },
    { label: t('stat_posts_week'), value: postsThisWeek ?? 0 },
    { label: t('stat_credits_reset'), value: daysToReset != null ? `${daysToReset}d` : t('no_stats') },
  ]

  const phase = phaseResult.phase
  const phaseName = t.raw(`phases.${phase}`) as string
  const phaseColorClass = PHASE_COLORS[phase] ?? PHASE_COLORS['F0']
  const modeKey = `mode_${policy.activeMode}` as 'mode_test' | 'mode_scale' | 'mode_monetize'

  return (
    <div className="text-white">
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-12">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t('welcome')}</h1>
          <p className="text-zinc-500 text-sm mt-0.5">{user.email}</p>
        </div>

        {/* Phase + score cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
            <p className="text-xs text-zinc-500 mb-1">{t('phase')}</p>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${phaseColorClass}`}>{phase}</span>
              <span className="text-sm font-semibold text-white">{phaseName}</span>
            </div>
          </div>

          <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
            <p className="text-xs text-zinc-500 mb-1">{t('capability_score')}</p>
            <div className="flex items-end gap-1">
              <span className="text-2xl font-bold text-white">{phaseResult.capabilityScore}</span>
              <span className="text-zinc-500 text-sm mb-0.5">/100</span>
            </div>
          </div>

          <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
            <p className="text-xs text-zinc-500 mb-1">{t('mode')}</p>
            <span className="text-sm font-semibold text-violet-400">{t(modeKey)}</span>
          </div>

          <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
            <p className="text-xs text-zinc-500 mb-1">{t('premium_credits')}</p>
            <span className="text-2xl font-bold text-white">{wallet?.premium_credits_balance ?? 0}</span>
          </div>
        </div>

        {/* Phase progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-zinc-500 mb-2">
            {['F0','F1','F2','F3','F4','F5','F6','F7'].map(f => (
              <span key={f} className={f === phase ? 'text-violet-400 font-bold' : ''}>{f}</span>
            ))}
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${phaseResult.capabilityScore}%` }}
            />
          </div>
        </div>

        {/* Mission map */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">{t('mission_map')}</h2>
          {missionNodes.length > 0 ? (
            <MissionMap
              missions={missionNodes}
              t={{
                start: t('start_mission'),
                resume: t('resume_mission'),
                completed: t('mission_completed'),
                locked: t('mission_locked'),
                xp: t('xp'),
                min: t('mission_min'),
                credits: t('credits'),
                types: t.raw('mission_types') as Record<string, string>,
              }}
            />
          ) : (
            <div className="bg-zinc-900 rounded-xl p-8 border border-zinc-800 text-center">
              <p className="text-zinc-300 font-medium">{t('no_mission')}</p>
              <p className="text-zinc-500 text-sm mt-1">{t('no_mission_sub')}</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mb-8">
          <a
            href="/studio"
            className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors"
          >
            {t('create_content')}
          </a>
          <a
            href="/calendar"
            className="px-5 py-3 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-semibold text-sm transition-colors"
          >
            {t('calendar')}
          </a>
        </div>

        {/* Calendar preview */}
        <div className="mb-8">
          <h2 className="text-base font-semibold mb-3 text-zinc-300">{t('calendar_preview')}</h2>
          <CalendarPreview days={calendarDays} />
        </div>

        {/* Daily Pulse */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">{t('growth_pulse')}</h2>
          <DailyPulseCard
            pulse={latestPulse}
            t={{
              title: t('growth_pulse'),
              refreshing: t('pulse_refreshing'),
              noData: t('pulse_no_data'),
              noDataSub: t('pulse_no_data_sub'),
              updated: t('pulse_updated'),
              priorityLabels: {
                high: t('pulse_priority_high'),
                medium: t('pulse_priority_medium'),
                low: t('pulse_priority_low'),
              },
            }}
          />
        </div>

        {/* Quick stats */}
        <div className="mb-8">
          <h2 className="text-base font-semibold mb-3 text-zinc-300">{t('quick_stats')}</h2>
          <QuickStats stats={quickStats} />
        </div>

        {/* Dimension scores */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(phaseResult.dimensionScores).map(([key, score]) => (
            <div key={key} className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
              <p className="text-xs text-zinc-500 capitalize mb-1">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full"
                    style={{ width: `${score}%` }}
                  />
                </div>
                <span className="text-xs text-zinc-400 w-8 text-right">{score}</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
    <AdminTrigger />
  )
}
