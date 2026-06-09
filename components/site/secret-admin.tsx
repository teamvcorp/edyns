'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Hidden admin entry point. Hold the Ctrl key for ~600ms and a small admin icon
 * fades in (bottom-right) linking to /admin/login. It stays for a few seconds so
 * you can click it, then disappears. This is only obscurity — the admin login is
 * still password-gated and proxy-protected; this just keeps the link off-screen
 * for the public.
 */
const HOLD_MS = 600
const VISIBLE_MS = 12_000

export function SecretAdmin() {
  const [show, setShow] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function clearHold() {
      if (holdTimer.current) {
        clearTimeout(holdTimer.current)
        holdTimer.current = null
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Control' && !holdTimer.current) {
        holdTimer.current = setTimeout(() => {
          setShow(true)
          holdTimer.current = null
        }, HOLD_MS)
      }
      if (e.key === 'Escape') setShow(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', (e) => e.key === 'Control' && clearHold())
    return () => {
      clearHold()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  // Auto-hide after a short window once revealed.
  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setShow(false), VISIBLE_MS)
    return () => clearTimeout(t)
  }, [show])

  if (!show) return null

  return (
    <a
      href="/admin/login"
      aria-label="Admin sign in"
      className="fixed right-4 bottom-4 z-50 inline-flex size-12 items-center justify-center rounded-full bg-olive-950 text-white shadow-lg ring-1 ring-white/10 transition hover:bg-olive-800 dark:bg-olive-300 dark:text-olive-950 dark:hover:bg-olive-200"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5" aria-hidden="true">
        <rect x="4" y="11" width="16" height="9" rx="2" />
        <path strokeLinecap="round" d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    </a>
  )
}
