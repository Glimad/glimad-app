import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGamificationState } from '@/lib/gamification'
import Link from 'next/link'

export default async function AppProgressBar() {
  const cookieStore = cookies()
  const supabaseRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
  const authCookie = cookieStore.get(`sb-${supabaseRef}-auth-token`)
  if (!authCookie?.value?.startsWith('base64-')) return null

  const session = JSON.parse(Buffer.from(authCookie.value.slice(7), 'base64').toString('utf-8'))
  if (!session.access_token) return null

  const admin = createAdminClient()
  const { data: authData } = await admin.auth.getUser(session.access_token)
  if (!authData.user) return null

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', authData.user.id)
    .neq('status', 'archived')
    .single()

  if (!project) return null

  const [gamification, walletResult, notifResult] = await Promise.all([
    getGamificationState(admin, project.id),
    admin.from('core_wallets')
      .select('premium_credits_balance')
      .eq('project_id', project.id)
      .single()
      .then(r => r.data),
    admin.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', authData.user.id)
      .is('read_at', null),
  ])

  const unreadCount = notifResult.count ?? 0

  if (!gamification) return null

  const energyColor = gamification.energy >= 50
    ? 'bg-green-500'
    : gamification.energy >= 20
    ? 'bg-amber-500'
    : 'bg-red-500'

  const energyTextColor = gamification.energy >= 50
    ? 'text-green-400'
    : gamification.energy >= 20
    ? 'text-amber-400'
    : 'text-red-400 animate-pulse'

  return (
    <div className="fixed top-14 left-14 right-0 z-30 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800/60">
      <div className="max-w-6xl mx-auto px-4 h-9 flex items-center justify-between gap-4">

        {/* Level + XP */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-zinc-400 whitespace-nowrap">
            Lv.{gamification.level}
          </span>
          <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full"
              style={{ width: `${Math.round((gamification.xpInLevel / gamification.xpForNext) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-zinc-500 hidden sm:block whitespace-nowrap">
            {gamification.xpInLevel}/{gamification.xpForNext} XP
          </span>
        </div>

        {/* Energy */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500">⚡</span>
          <div className="w-14 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${energyColor}`} style={{ width: `${gamification.energy}%` }} />
          </div>
          <span className={`text-xs font-medium ${energyTextColor} whitespace-nowrap`}>
            {gamification.energy}
          </span>
        </div>

        {/* Streak */}
        <div className="flex items-center gap-1">
          <span className="text-sm">{gamification.streak > 0 ? '🔥' : '💤'}</span>
          <span className="text-xs font-semibold text-white">{gamification.streak}</span>
        </div>

        {/* Premium credits */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-zinc-500">💎</span>
          <span className="text-xs font-semibold text-white">{walletResult?.premium_credits_balance ?? 0}</span>
        </div>

        {/* User email (abbreviated) */}
        <span className="text-xs text-zinc-600 hidden md:block truncate max-w-32">
          {authData.user.email}
        </span>

        {/* Notification bell */}
        <Link href="/notifications" className="relative flex items-center justify-center w-7 h-7 rounded-lg hover:bg-zinc-800 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-violet-600 rounded-full text-white text-[10px] font-bold flex items-center justify-center leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

      </div>
    </div>
  )
}
