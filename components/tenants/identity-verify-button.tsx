'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/elements/button'

/** Starts a Stripe Identity session and handles the return (?identity=done). */
export function IdentityVerifyButton({ returning = false }: { returning?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // On return from Stripe, persist the result then drop the query param.
  useEffect(() => {
    if (!returning) return
    fetch('/api/identity/status').finally(() => router.replace('/tenants'))
  }, [returning, router])

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/identity/start', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start verification.')
      window.location.href = data.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start verification.')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={start} disabled={busy} className="w-fit disabled:opacity-60">
        {busy ? 'Starting…' : returning ? 'Checking…' : 'Verify my identity'}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </div>
  )
}
