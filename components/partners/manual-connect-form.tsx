'use client'

import { useActionState } from 'react'
import { SoftButton } from '@/components/elements/button'
import { saveManualConnectAccount, type ManualConnectState } from '@/app/actions/payouts'

import { inputClass } from '@/components/elements/input'

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
