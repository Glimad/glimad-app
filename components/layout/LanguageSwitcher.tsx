'use client'

import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/navigation'
import { useState, useRef, useEffect } from 'react'
import { locales } from '@/i18n.config'

export default function LanguageSwitcher() {
  const locale = useLocale()
  const t = useTranslations('common.lang')
  const pathname = usePathname()
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

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next })
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
      >
        <span className="uppercase font-medium">{locale}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-32 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl py-1 z-50">
          {locales.map(l => (
            <button
              key={l}
              onClick={() => switchLocale(l)}
              className={`w-full text-left px-3 py-2 text-sm transition hover:bg-zinc-800 ${
                l === locale ? 'text-white font-medium' : 'text-zinc-400'
              }`}
            >
              {t(l)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
