'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaidLink } from 'react-plaid-link'
import { Button } from '@/components/elements/button'
import { completePlaidLink } from '@/app/actions/plaid'

export function PlaidVerifyButton() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    fetch('/api/tenants/plaid/link-token', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => (d.link_token ? setToken(d.link_token) : setError('Could not start verification.')))
      .catch(() => setError('Could not start verification.'))
  }, [])

  const onSuccess = useCallback(
    (publicToken: string) => {
      startTransition(async () => {
        const res = await completePlaidLink(publicToken)
        if (res?.error) setError(res.error)
        else router.refresh()
      })
    },
    [router],
  )

  const { open, ready } = usePlaidLink({ token, onSuccess })

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={() => open()} disabled={!ready || !token || pending} className="w-fit disabled:opacity-60">
        {pending ? 'Verifying…' : 'Verify with Plaid'}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </div>
  )
}
