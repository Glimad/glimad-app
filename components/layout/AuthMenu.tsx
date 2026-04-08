'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n'

type Props = {
  user: { email: string } | null
}

export default function AuthMenu({ user }: Props) {
  const t = useT('common.header')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <a
          href="/login"
          className="px-3 py-1.5 text-sm text-zinc-300 hover:text-white transition"
        >
          {t('login')}
        </a>
        <a
          href="/signup"
          className="px-4 py-1.5 text-sm rounded-lg bg-white text-black font-medium hover:bg-zinc-200 transition"
        >
          {t('signup')}
        </a>
      </div>
    )
  }

  const initials = user.email.slice(0, 2).toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition"
      >
        <span className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold text-white">
          {initials}
        </span>
        <span className="text-sm text-zinc-300 max-w-[140px] truncate">{user.email}</span>
        <svg className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-44 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl py-1 z-50">
          <a
            href="/dashboard"
            className="block px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
            onClick={() => setOpen(false)}
          >
            {t('dashboard')}
          </a>
          <a
            href="/studio"
            className="block px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
            onClick={() => setOpen(false)}
          >
            {t('studio')}
          </a>
          <a
            href="/calendar"
            className="block px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
            onClick={() => setOpen(false)}
          >
            {t('calendar')}
          </a>
          <div className="my-1 border-t border-zinc-800" />
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-zinc-800 transition"
          >
            {t('logout')}
          </button>
        </div>
      )}
    </div>
  )
}
