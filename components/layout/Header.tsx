import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import LanguageSwitcher from './LanguageSwitcher'
import AuthMenu from './AuthMenu'

export default async function Header() {
  const cookieStore = cookies()
  const authCookie = cookieStore.get('sb-awaakurvnngazmnnmwza-auth-token')
  let user = null
  if (authCookie?.value?.startsWith('base64-')) {
    const session = JSON.parse(Buffer.from(authCookie.value.slice(7), 'base64').toString('utf-8'))
    if (session.access_token) {
      const admin = createAdminClient()
      const { data } = await admin.auth.getUser(session.access_token)
      user = data.user
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-md border-b border-zinc-800">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <a href={user ? '/dashboard' : '/onboarding'} className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://www.glimad.com/assets/5214dd55518a7c14c563198b177e58a9471a0f73-DFAXz9bY.png" alt="Glimad" width={40} height={40} />
        </a>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <div className="w-px h-5 bg-zinc-700 mx-1" />
          <AuthMenu user={user ? { email: user.email! } : null} />
        </div>
      </div>
    </header>
  )
}
