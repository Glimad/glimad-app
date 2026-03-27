'use client'

import { createContext, useContext, useState } from 'react'
import { NextIntlClientProvider } from 'next-intl'

type Messages = Record<string, unknown>

interface LocaleContextValue {
  locale: string
  switchLocale: (next: string) => void
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'es',
  switchLocale: () => {},
})

export function useLocaleSwitch() {
  return useContext(LocaleContext)
}

export default function ClientLocaleProvider({
  locale: initialLocale,
  allMessages,
  children,
}: {
  locale: string
  allMessages: Record<string, Messages>
  children: React.ReactNode
}) {
  const [locale, setLocale] = useState(initialLocale)

  function switchLocale(next: string) {
    if (next === locale) return
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000`
    setLocale(next)
  }

  return (
    <LocaleContext.Provider value={{ locale, switchLocale }}>
      <NextIntlClientProvider locale={locale} messages={allMessages[locale]}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  )
}
