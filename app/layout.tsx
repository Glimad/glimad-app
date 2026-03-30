import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { cookies } from 'next/headers'
import { locales, defaultLocale } from '@/i18n.config'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import ClientLocaleProvider from '@/components/layout/ClientLocaleProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Glimad',
}

async function loadMessages(locale: string) {
  const [auth, subscribe, dashboard, missions, common, onboarding, studio, calendar] = await Promise.all([
    import(`../messages/${locale}/auth.json`),
    import(`../messages/${locale}/subscribe.json`),
    import(`../messages/${locale}/dashboard.json`),
    import(`../messages/${locale}/missions.json`),
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/onboarding.json`),
    import(`../messages/${locale}/studio.json`),
    import(`../messages/${locale}/calendar.json`),
  ])
  return {
    auth: auth.default,
    subscribe: subscribe.default,
    dashboard: dashboard.default,
    missions: missions.default,
    common: common.default,
    onboarding: onboarding.default,
    studio: studio.default,
    calendar: calendar.default,
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = cookies()
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value
  const locale = locales.includes(cookieLocale as typeof locales[number]) ? cookieLocale! : defaultLocale

  const otherLocale = locale === 'en' ? 'es' : 'en'
  const [currentMessages, otherMessages] = await Promise.all([
    loadMessages(locale),
    loadMessages(otherLocale),
  ])

  const allMessages = {
    [locale]: currentMessages,
    [otherLocale]: otherMessages,
  }

  return (
    <html lang={locale}>
      <body className={`${inter.className} bg-black`}>
        <ClientLocaleProvider locale={locale} allMessages={allMessages}>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1 pt-14">
              {children}
            </main>
            <Footer />
          </div>
        </ClientLocaleProvider>
      </body>
    </html>
  )
}
