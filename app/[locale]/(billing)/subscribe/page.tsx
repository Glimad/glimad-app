import { getTranslations } from 'next-intl/server'

export default async function SubscribePage() {
  const t = await getTranslations('subscribe')

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-white text-center">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-zinc-400 mt-2">{t('subtitle')}</p>
      </div>
    </div>
  )
}
