'use client'

import { useEffect } from 'react'

/**
 * Sends a crash that reached an error boundary to /api/client-error so it lands
 * in the server logs (Vercel runtime logs), and logs it to the browser console.
 * Pathname only — never the query string, which can hold secrets.
 * Fire-and-forget: reporting must never cause a second error.
 */
export function useErrorReport(error: Error & { digest?: string }, boundary: 'page' | 'global') {
  useEffect(() => {
    console.error(`[${boundary}-error]`, error)
    try {
      const body = JSON.stringify({
        message: error.message,
        name: error.name,
        digest: error.digest,
        path: window.location.pathname,
        boundary,
      })
      // keepalive lets the report finish even if the user navigates away.
      void fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    } catch {
      /* reporting is best-effort; the console line above is the fallback */
    }
  }, [error, boundary])
}
