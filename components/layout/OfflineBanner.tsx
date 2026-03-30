'use client'

import { useEffect, useState } from 'react'

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    function onOnline() { setOffline(false) }
    function onOffline() { setOffline(true) }

    setOffline(!navigator.onLine)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="fixed top-14 left-0 right-0 z-50 bg-amber-600 text-white text-center text-sm py-2 px-4 font-medium">
      No internet connection — changes will be saved when you reconnect
    </div>
  )
}
