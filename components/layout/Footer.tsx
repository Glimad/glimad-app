import { getTranslations } from 'next-intl/server'
import Image from 'next/image'

const LOGO_ICON = 'https://awaakurvnngazmnnmwza.supabase.co/storage/v1/object/public/public-assets/logo-icon.png'

export default async function Footer({ locale }: { locale: string }) {
  const t = await getTranslations('common.footer')

  return (
    <footer className="border-t border-zinc-800 bg-black">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image src={LOGO_ICON} alt="Glimad" width={24} height={24} />
          <span className="text-zinc-500 text-sm">{t('tagline')}</span>
        </div>

        <div className="flex items-center gap-6 text-sm text-zinc-500">
          <a href={`/${locale}/terms`} className="hover:text-zinc-300 transition">{t('terms')}</a>
          <a href={`/${locale}/privacy`} className="hover:text-zinc-300 transition">{t('privacy')}</a>
          <span>{t('copyright')}</span>
        </div>
      </div>
    </footer>
  )
}
