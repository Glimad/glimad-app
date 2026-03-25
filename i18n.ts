import { getRequestConfig } from 'next-intl/server'
export { locales, defaultLocale } from './i18n.config'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = requested ?? 'es'
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  }
})
