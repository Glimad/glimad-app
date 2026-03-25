import { getTranslations } from 'next-intl/server'

export default async function Footer({ locale }: { locale: string }) {
  const t = await getTranslations('common.footer')

  return (
    <footer className="border-t border-zinc-800 bg-black">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-base tracking-tight">
            glim<span className="text-violet-400">ad</span>
          </span>
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
