'use client'

import { useActionState } from 'react'
import { SoftButton } from '@/components/elements/button'
import { saveManualConnectAccount, type ManualConnectState } from '@/app/actions/payouts'

const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10'

export function ManualConnectForm() {
  const [state, action, pending] = useActionState<ManualConnectState, FormData>(saveManualConnectAccount, undefined)

  return (
    <form action={action} className="flex flex-col gap-2">
      <label className="text-sm font-medium text-olive-950 dark:text-white">
        Existing Stripe account ID
        <input name="accountId" placeholder="acct_1A2b3C..." className={`mt-1 ${inputClass}`} />
      </label>
      {state?.error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </span>
      )}
      {state?.ok && <span className="text-xs text-olive-700 dark:text-olive-300">Account linked.</span>}
      <SoftButton type="submit" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Linking…' : 'Link existing account'}
      </SoftButton>
    </form>
  )
}
