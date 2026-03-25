import { redirect } from 'next/navigation'

export default function LocaleRootPage({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/dashboard`)
}
