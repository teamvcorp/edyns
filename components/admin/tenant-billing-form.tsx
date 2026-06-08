'use client'

import { useActionState } from 'react'
import { Button } from '@/components/elements/button'
import { startTenantBillingAction, type AdminActionState } from '@/app/actions/admin'

const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10'
const labelClass = 'text-sm font-medium text-olive-950 dark:text-white'

export function TenantBillingForm({ tenantId }: { tenantId: string }) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(startTenantBillingAction, undefined)

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={tenantId} />

      <label className="flex flex-col gap-1">
        <span className={labelClass}>Recurring amount (40% of pay, in dollars)</span>
        <input name="amount" type="number" min="1" step="0.01" required placeholder="e.g. 720.00" className={inputClass} />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>Draft frequency</span>
        <select name="frequency" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Select frequency…
          </option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every 2 weeks</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>First draft date</span>
        <input name="firstDraft" type="date" required className={inputClass} />
      </label>

      <p className="text-xs text-olive-600 dark:text-olive-500">
        The tenant is charged this amount plus Stripe’s processing fee (which they cover), drafting on the schedule above
        starting the first draft date.
      </p>

      {state?.error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </span>
      )}

      <Button type="submit" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Starting…' : 'Start rent collection'}
      </Button>
    </form>
  )
}
