import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { locales, defaultLocale } from './i18n.config'
export { locales, defaultLocale } from './i18n.config'

export type Locale = typeof locales[number]

export default getRequestConfig(async () => {
  const cookieStore = cookies()
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value
  const locale = locales.includes(cookieLocale as Locale) ? (cookieLocale as Locale) : defaultLocale

  const [auth, subscribe, dashboard, missions, common, onboarding] = await Promise.all([
    import(`./messages/${locale}/auth.json`),
    import(`./messages/${locale}/subscribe.json`),
    import(`./messages/${locale}/dashboard.json`),
    import(`./messages/${locale}/missions.json`),
    import(`./messages/${locale}/common.json`),
    import(`./messages/${locale}/onboarding.json`),
  ])

  return {
    locale,
    messages: {
      auth: auth.default,
      subscribe: subscribe.default,
      dashboard: dashboard.default,
      missions: missions.default,
      common: common.default,
      onboarding: onboarding.default,
    },
  }
})
