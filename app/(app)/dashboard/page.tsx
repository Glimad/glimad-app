import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { runPhaseEngine } from '@/lib/engines/phase-engine'
import { runInflexionEngine } from '@/lib/engines/inflexion-engine'
import { runPolicyEngine } from '@/lib/engines/policy-engine'
import MissionCard from './MissionCard'

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

  const phaseResult = await runPhaseEngine(admin, project.id)
  const inflexion = await runInflexionEngine(admin, project.id)
  const policy = await runPolicyEngine(admin, project.id, phaseResult, inflexion)

  const { data: wallet } = await admin
    .from('core_wallets')
    .select('allowance_llm_balance, premium_credits_balance, plan_code')
    .eq('project_id', project.id)
    .single()

  let topMissionTemplate: { template_code: string; name: string; description: string; type: string } | null = null
  let activeMissionInstance: { id: string; status: string } | null = null

  if (policy.topMission) {
    const { data: tmpl } = await admin
      .from('mission_templates')
      .select('template_code, name, description, type')
      .eq('template_code', policy.topMission)
      .single()
    topMissionTemplate = tmpl ?? null

    const { data: activeInst } = await admin
      .from('mission_instances')
      .select('id, status')
      .eq('project_id', project.id)
      .eq('template_code', policy.topMission)
      .in('status', ['queued', 'running', 'waiting_input'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    activeMissionInstance = activeInst ?? null
  }

  const phase = phaseResult.phase
  const phaseName = t.raw(`phases.${phase}`) as string
  const phaseColorClass = PHASE_COLORS[phase] ?? PHASE_COLORS['F0']

  const modeKey = `mode_${policy.activeMode}` as 'mode_test' | 'mode_scale' | 'mode_monetize'

  return (
    <div className="text-white">
      <div className="max-w-6xl mx-auto px-4 pt-8 pb-12">

        <div className="mb-8">
          <h1 className="text-2xl font-bold">{t('welcome')}</h1>
          <p className="text-zinc-500 text-sm mt-1">{user.email}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
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

        <div className="mb-8">
          <div className="flex justify-between text-xs text-zinc-500 mb-2">
            <span>F0</span>
            <span>F1</span>
            <span>F2</span>
            <span>F3</span>
            <span>F4</span>
            <span>F5</span>
            <span>F6</span>
            <span>F7</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${phaseResult.capabilityScore}%` }}
            />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">{t('next_mission')}</h2>

          {topMissionTemplate ? (
            <MissionCard
              template={topMissionTemplate}
              activeInstance={activeMissionInstance}
              t={{
                start: t('start_mission'),
                resume: t('resume_mission'),
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

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
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
  )
}
