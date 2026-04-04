'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CalendarDays, Wand2, DollarSign, Target } from 'lucide-react'
import { useT } from '@/lib/i18n'

export default function AppSidebar() {
  const pathname = usePathname()
  const t = useT('common.sidebar')

  const NAV_ITEMS = [
    { href: '/dashboard', icon: LayoutDashboard, label: t('dashboard') },
    { href: '/missions', icon: Target, label: t('missions') },
    { href: '/calendar', icon: CalendarDays, label: t('calendar') },
    { href: '/studio', icon: Wand2, label: t('studio') },
    { href: '/monetization', icon: DollarSign, label: t('monetization') },
  ]

  return (
    <nav className="fixed top-14 left-0 bottom-0 w-14 z-30 bg-zinc-950 border-r border-zinc-800 flex flex-col items-center py-3 gap-1">
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
              isActive
                ? 'bg-violet-600 text-white'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Icon size={20} />
          </Link>
        )
      })}
    </nav>
  )
}
