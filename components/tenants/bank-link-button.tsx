'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from 'react-plaid-link'
import { Button } from '@/components/elements/button'
import { completeBankLink, completeBankRelink } from '@/app/actions/paychecks'

export type BankLinkMode = 'link' | 'relink' | 'statements'

/**
 * Opens Plaid Link for the PAYCHECK bank connection (Transactions + Statements
 * consent), separate from income verification. `mode`:
 *  - 'link'       connect the account the paycheck lands in (tenant picks ONE account);
 *  - 'relink'     update mode after the bank asked them to sign in again;
 *  - 'statements' update mode to approve sharing statements for an income review.
 * The link token + purpose are stashed for OAuth banks, which redirect to
 * /tenants/plaid-oauth (components/tenants/plaid-oauth-return.tsx resumes there).
 */
export function BankLinkButton({ mode = 'link', label }: { mode?: BankLinkMode; label?: string }) {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Fetch a link token on mount. State is only set inside the async callback
  // (never synchronously in the effect), and a stale response is ignored.
  useEffect(() => {
    let cancelled = false
    fetch('/api/tenants/plaid/bank-link-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode }),
    })
      .then((res) => res.json())
      .then((d: { link_token?: string; error?: string }) => {
        if (cancelled) return
        if (!d.link_token) return setError(d.error ?? 'Could not start bank connection.')
        setToken(d.link_token)
        try {
          localStorage.setItem('plaid_link_token', d.link_token)
          localStorage.setItem('plaid_link_purpose', mode === 'link' ? 'bank-link' : 'bank-relink')
        } catch (e) {
          console.warn('[bank-link] localStorage unavailable:', e)
        }
      })
      .catch((e) => {
        console.error('[bank-link] token request failed:', e)
        if (!cancelled) setError('Could not start bank connection.')
      })
    return () => {
      cancelled = true
    }
  }, [mode])

  const onSuccess = useCallback(
    (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      try {
        localStorage.removeItem('plaid_link_token')
        localStorage.removeItem('plaid_link_purpose')
      } catch (e) {
        console.warn('[bank-link] localStorage unavailable:', e)
      }
      startTransition(async () => {
        const res =
          mode === 'link'
            ? await completeBankLink(publicToken, metadata.accounts?.[0]?.id ?? '')
            : await completeBankRelink()
        if (res?.error) setError(res.error)
        else router.refresh()
      })
    },
    [mode, router],
  )

  const { open, ready } = usePlaidLink({ token, onSuccess })

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={() => open()} disabled={!ready || !token || pending} className="w-fit disabled:opacity-60">
        {pending
          ? 'Saving…'
          : (label ?? (mode === 'link' ? 'Connect your paycheck account' : mode === 'relink' ? 'Reconnect your bank' : 'Approve sharing statements'))}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </div>
  )
}
