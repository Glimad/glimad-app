export const locales = ['es', 'en'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'es'

export function resolveLocale(input?: string | null): Locale {
  if (input && locales.includes(input as Locale)) return input as Locale
  return defaultLocale
}
