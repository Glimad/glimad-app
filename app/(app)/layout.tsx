import AppProgressBar from '@/components/layout/AppProgressBar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppProgressBar />
      <div className="pt-9">
        {children}
      </div>
    </>
  )
}
