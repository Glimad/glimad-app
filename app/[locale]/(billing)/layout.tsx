import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'

export default function BillingLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  return (
    <div className="min-h-screen flex flex-col bg-black">
      <Header locale={locale} />
      <main className="flex-1 pt-14">
        {children}
      </main>
      <Footer locale={locale} />
    </div>
  )
}
