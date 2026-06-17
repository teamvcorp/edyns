'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaidLink } from 'react-plaid-link'
import { Button } from '@/components/elements/button'
import { completePlaidLink } from '@/app/actions/plaid'

export function PlaidVerifyButton({ selfEmployed = false }: { selfEmployed?: boolean }) {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [loadingToken, setLoadingToken] = useState(false)
  // Set when the user picks the bank fallback so Link opens once it re-initializes.
  const [autoOpen, setAutoOpen] = useState(false)

  // Fetch a Link token for the given income source and stash it so an OAuth bank
  // redirect can resume on /tenants/plaid-oauth. Default source: payroll for
  // employees, bank for the self-employed (forced server-side).
  const fetchToken = useCallback(async (source?: 'bank') => {
    setError(null)
    setLoadingToken(true)
    try {
      const res = await fetch('/api/tenants/plaid/link-token', {
        method: 'POST',
        ...(source ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source }) } : {}),
      })
      const d = await res.json()
      if (!d.link_token) {
        setError(d.error ?? 'Could not start verification.')
        return false
      }
      setToken(d.link_token)
      try {
        localStorage.setItem('plaid_link_token', d.link_token)
      } catch {
        /* storage may be unavailable */
      }
      return true
    } catch {
      setError('Could not start verification.')
      return false
    } finally {
      setLoadingToken(false)
    }
  }, [])

  // Pre-load the default token so the primary button is ready immediately.
  useEffect(() => {
    fetchToken()
  }, [fetchToken])

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
        else router.refresh()
      })
    },
    [router],
  )

  const { open, ready } = usePlaidLink({ token, onSuccess })

  // After switching sources (the bank fallback), open Link once it re-initializes
  // with the new token.
  useEffect(() => {
    if (autoOpen && ready && token) {
      setAutoOpen(false)
      open()
    }
  }, [autoOpen, ready, token, open])

  const useBankFallback = useCallback(async () => {
    if (await fetchToken('bank')) setAutoOpen(true)
  }, [fetchToken])

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        onClick={() => open()}
        disabled={!ready || !token || pending}
        className="w-fit disabled:opacity-60"
      >
        {pending ? 'Verifying…' : 'Verify with Plaid'}
      </Button>
      {!selfEmployed && (
        <button
          type="button"
          onClick={useBankFallback}
          disabled={loadingToken || pending}
          className="w-fit text-left text-xs text-olive-600 underline disabled:opacity-60 dark:text-olive-500"
        >
          My employer’s payroll isn’t supported — verify with bank deposits instead
        </button>
      )}
      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </div>
  )
}
