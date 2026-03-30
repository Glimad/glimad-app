'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminTrigger() {
  const router = useRouter()
  const lastClick = useRef(0)

  function handleClick() {
    const now = Date.now()
    if (now - lastClick.current < 400) {
      router.push('/admin')
    }
    lastClick.current = now
  }

  return (
    <div
      onClick={handleClick}
      className="fixed bottom-0 right-0 w-12 h-12 z-50 cursor-default"
      aria-hidden="true"
    />
  )
}
