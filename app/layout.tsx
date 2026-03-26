import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Glimad',
  description: 'AI-powered growth operating system for digital creators',
  icons: {
    icon: 'https://awaakurvnngazmnnmwza.supabase.co/storage/v1/object/public/public-assets/favicon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  )
}
