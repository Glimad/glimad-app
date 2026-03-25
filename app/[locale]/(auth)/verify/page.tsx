import { useTranslations } from 'next-intl'

export default function VerifyPage() {
  const t = useTranslations('auth.verify')

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-md p-8 space-y-4 text-center">
        <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
        <p className="text-zinc-400">{t('body')}</p>
        <p className="text-zinc-500 text-sm">{t('hint')}</p>
      </div>
    </div>
  )
}
