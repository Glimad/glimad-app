import { getTranslations } from 'next-intl/server'
import { createAdminClient } from '@/lib/supabase/admin'
import CheckoutButton from './CheckoutButton'

type Plan = {
  plan_code: string
  name: string
  price_monthly_eur: number
}

export default async function SubscribePage() {
  const t = await getTranslations('subscribe')
  const admin = createAdminClient()

  const { data: plans } = await admin
    .from('core_plans')
    .select('plan_code, name, price_monthly_eur')
    .eq('active', true)
    .order('price_monthly_eur', { ascending: true })

  const planList: Plan[] = plans ?? []

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 py-16">
      <h1 className="text-4xl font-bold text-white text-center">{t('title')}</h1>
      <p className="mt-3 text-zinc-400 text-center">{t('subtitle')}</p>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
        {planList.map((plan) => {
          const code = plan.plan_code as 'BASE' | 'PRO' | 'ELITE'
          const features = t.raw(`plans.${code}.features`) as string[]
          const description = t(`plans.${code}.description`)

          return (
            <div
              key={code}
              className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl p-8"
            >
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                  {plan.name}
                </p>
                <p className="mt-1 text-zinc-400 text-sm">{description}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">
                    €{plan.price_monthly_eur}
                  </span>
                  <span className="text-zinc-400 text-sm">{t('per_month')}</span>
                </div>
              </div>

              <ul className="flex-1 space-y-3 mb-8">
                {features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                    <span className="mt-0.5 text-white">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <CheckoutButton planCode={code} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
