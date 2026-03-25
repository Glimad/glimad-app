import { createClient } from '@/lib/supabase/server'
import Image from 'next/image'
import LanguageSwitcher from './LanguageSwitcher'
import AuthMenu from './AuthMenu'

const LOGO_FULL = 'https://awaakurvnngazmnnmwza.supabase.co/storage/v1/object/public/public-assets/logo-full.png'

export default async function Header({ locale }: { locale: string }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-md border-b border-zinc-800">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <a href={`/${locale}/onboarding`} className="flex items-center">
          <Image src={LOGO_FULL} alt="Glimad" width={100} height={28} priority />
        </a>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <div className="w-px h-5 bg-zinc-700 mx-1" />
          <AuthMenu
            user={user ? { email: user.email! } : null}
            locale={locale}
          />
        </div>
      </div>
    </header>
  )
}
