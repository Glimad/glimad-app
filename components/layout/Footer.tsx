'use client'

import Image from 'next/image'
import { useT } from '@/lib/i18n'

export default function Footer() {
  const t = useT('common.footer')
  const logoIcon = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/public-assets/logo-icon.png`

  return (
    <footer className="border-t border-zinc-800 bg-black">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image src={logoIcon} alt="Glimad" width={24} height={24} />
          <span className="text-zinc-500 text-sm">{t('tagline')}</span>
        </div>

        <div className="flex items-center gap-6 text-sm text-zinc-500">
          <a href="/terms" className="hover:text-zinc-300 transition">{t('terms')}</a>
          <a href="/privacy" className="hover:text-zinc-300 transition">{t('privacy')}</a>
          <span>{t('copyright')}</span>
        </div>
      </div>
    </footer>
  )
}
