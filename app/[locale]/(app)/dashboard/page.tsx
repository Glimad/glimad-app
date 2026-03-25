import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const locale = await getLocale()
  const t = await getTranslations('dashboard')

  if (!user) redirect(`/${locale}/login`)

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <h1 className="text-3xl font-bold">{t('welcome')}</h1>
      <p className="text-zinc-400 mt-2">{user.email}</p>
    </div>
  )
}
