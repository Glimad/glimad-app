'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  const t = useT('auth.login')
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }

    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', data.user.id)
      .neq('status', 'archived')
      .single()

    if (!project) { router.push('/subscribe'); router.refresh(); return }

    const { data: subs } = await supabase
      .from('core_subscriptions')
      .select('status')
      .eq('project_id', project.id)
      .eq('status', 'active')
      .limit(1)

    if (subs && subs.length > 0) {
      router.push('/dashboard')
    } else {
      router.push('/subscribe')
    }
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-md p-8 space-y-6">
        <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
        <p className="text-zinc-400">{t('subtitle')}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-300 mb-1">{t('email')}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-violet-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-300 mb-1">{t('password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-violet-500"
              required
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
          >
            {loading ? t('loading') : t('submit')}
          </button>
        </form>
        <p className="text-center text-zinc-400 text-sm">
          {t('signup_link')}{' '}
          <Link href="/signup" className="text-violet-400 hover:text-violet-300">
            {t('signup_cta')}
          </Link>
        </p>
      </div>
    </div>
  )
}
