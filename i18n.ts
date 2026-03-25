import { getRequestConfig } from 'next-intl/server'
export { locales, defaultLocale } from './i18n.config'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = requested ?? 'es'

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
