'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaidLink } from 'react-plaid-link'
import { completePlaidLink } from '@/app/actions/plaid'
import { Link } from '@/components/elements/link'

/**
 * OAuth continuation page. After a bank's OAuth flow, Plaid redirects here; we
 * re-initialize Link with the original link token (stashed in localStorage) plus
 * the received redirect URI, then resume automatically.
 */
export function PlaidOAuthReturn() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('plaid_link_token') : null
    if (stored) setToken(stored)
    else setError('We couldn’t resume verification. Please start again from your portal.')
  }, [])

  const onSuccess = useCallback(
    (publicToken: string) => {
      try {
        localStorage.removeItem('plaid_link_token')
      } catch {
        /* ignore */
      }
      startTransition(async () => {
        const res = await completePlaidLink(publicToken)
        if (res?.error) setError(res.error)
        else router.replace('/tenants')
      })
    },
    [router],
  )

  const { open, ready } = usePlaidLink({
    token,
    receivedRedirectUri: typeof window !== 'undefined' ? window.location.href : undefined,
    onSuccess,
  })

  // Resume Link as soon as it's ready.
  useEffect(() => {
    if (ready && token) open()
  }, [ready, token, open])

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
        <Link href="/tenants">← Back to your portal</Link>
      </div>
    )
  }

  return <p className="text-sm text-olive-700 dark:text-olive-300">Finishing your bank verification…</p>
}
