import { createClient } from '@/lib/supabase/server'
import LanguageSwitcher from './LanguageSwitcher'
import AuthMenu from './AuthMenu'

export default async function Header({ locale }: { locale: string }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-md border-b border-zinc-800">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <a href={`/${locale}/onboarding`} className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Glimad" width={40} height={40} />
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
