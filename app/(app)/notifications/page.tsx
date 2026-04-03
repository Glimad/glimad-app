import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import MarkReadButton from './MarkReadButton'

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffH = Math.floor(diffMs / 3600000)
  if (diffH < 1) return 'Just now'
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}d ago`
  return d.toLocaleDateString()
}

const TYPE_ICON: Record<string, string> = {
  mission_reminder: '🎯',
  publish_success: '✅',
  publish_failed: '❌',
  weekly_digest: '📊',
  capability_followup: '⚡',
}

export default async function NotificationsPage() {
  const cookieStore = cookies()
  const supabaseRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
  const authCookie = cookieStore.get(`sb-${supabaseRef}-auth-token`)
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

  const { data: notifications } = await admin
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const items = notifications ?? []
  const unread = items.filter(n => !n.read_at)

  return (
    <div className="text-white max-w-2xl mx-auto px-4 pt-6 pb-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unread.length > 0 && (
            <p className="text-zinc-500 text-sm mt-0.5">{unread.length} unread</p>
          )}
        </div>
        {unread.length > 0 && (
          <MarkReadButton ids={unread.map(n => n.id)} />
        )}
      </div>

      {items.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl p-10 border border-zinc-800 text-center">
          <p className="text-4xl mb-3">🔔</p>
          <p className="text-zinc-300 font-medium">No notifications yet</p>
          <p className="text-zinc-500 text-sm mt-1">Mission updates and digest summaries will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <div
              key={n.id}
              className={`bg-zinc-900 rounded-xl p-4 border transition-colors ${
                n.read_at ? 'border-zinc-800 opacity-60' : 'border-violet-800/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">{TYPE_ICON[n.type] ?? '📬'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-white">{n.title}</p>
                    {!n.read_at && (
                      <span className="w-2 h-2 bg-violet-500 rounded-full flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-zinc-400 leading-snug">{n.body}</p>
                  <p className="text-xs text-zinc-600 mt-1">{formatTime(n.created_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
