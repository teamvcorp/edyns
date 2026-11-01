'use client'

import { useActionState, useState } from 'react'
import { Button, SoftButton } from '@/components/elements/button'
import { inputClass } from '@/components/elements/input'
import { formatCents } from '@/lib/format'
import { addRentCreditAction, type RentFormState } from '@/app/actions/rent'

const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white'

/**
 * Record a payment made outside Stripe (cash, check, …) as a credit on the
 * tenant's Stripe balance. Stripe applies it to the next draft(s) automatically.
 * `nonce` is a one-time id from the server render — the Stripe idempotency key,
 * so a double-click can't credit twice.
 */
export function RentCreditForm({
  tenantId,
  nonce,
  nextDraftCents,
  today,
}: {
  tenantId: string
  nonce: string
  /** One full draft (fee included) — offered as a one-click amount. */
  nextDraftCents: number
  /** Today as yyyy-mm-dd from the server (latest allowed received date; the action re-checks). */
  today: string
}) {
  const [state, action, pending] = useActionState<RentFormState, FormData>(addRentCreditAction, undefined)
  const [amount, setAmount] = useState('')

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="nonce" value={nonce} />

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          Amount received (USD)
          <input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Paid by
          <select name="method" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Choose…
            </option>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="money_order">Money order</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className={labelClass}>
          Date received
          <input name="receivedAt" type="date" required max={today} defaultValue={today} className={inputClass} />
        </label>
      </div>

      <SoftButton type="button" className="w-fit" onClick={() => setAmount((nextDraftCents / 100).toFixed(2))}>
        Fill one full payment ({formatCents(nextDraftCents)})
      </SoftButton>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Reference (optional)
          <input name="reference" maxLength={100} placeholder="e.g. Check #1042" className={inputClass} />
        </label>
        <label className={labelClass}>
          Note (internal, optional)
          <input name="note" maxLength={500} className={inputClass} />
        </label>
      </div>

      <p className="text-xs text-olive-600 dark:text-olive-500">
        The credit reduces the next draft; anything over one draft carries to the following one. The partner’s equity share
        is credited when the covered draft comes due. Don’t also record this on the property’s cash-payment form.
      </p>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-sm text-olive-700 dark:text-olive-300">
          {state.ok}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Adding credit…' : 'Add credit'}
      </Button>
    </form>
  )
}
