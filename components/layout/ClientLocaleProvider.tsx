'use client'

import { useState } from 'react'
import { LocaleContext } from '@/lib/i18n'

type Messages = Record<string, unknown>

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
  const [messages, setMessages] = useState<Messages>(allMessages[initialLocale] ?? {})

  function switchLocale(next: string) {
    if (next === locale) return
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000`
    setLocale(next)
    setMessages(allMessages[next] ?? {})
    fetch('/api/user/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: next }),
    })
  }

  return (
    <LocaleContext.Provider value={{ locale, messages, switchLocale }}>
      {children}
    </LocaleContext.Provider>
  )
}
