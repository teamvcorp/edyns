'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/elements/button'
import { inputClass } from '@/components/elements/input'
import { withProcessingFee } from '@/lib/fees'
import { formatCents } from '@/lib/format'
import { adjustRentAction, type RentFormState } from '@/app/actions/rent'

const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white'

/**
 * Change rent amount / frequency / next draft date for a tenant with active
 * rent collection. No proration: the new terms start on the chosen date.
 * `nonce` is a one-time id from the server render — the Stripe idempotency key.
 */
export function RentAdjustForm({
  tenantId,
  nonce,
  current,
  minDate,
}: {
  tenantId: string
  nonce: string
  current: { baseDollars: number; frequency: string; nextDraft: string }
  /** Earliest selectable next draft (yyyy-mm-dd), computed on the server. The action re-checks it. */
  minDate: string
}) {
  const [state, action, pending] = useActionState<RentFormState, FormData>(adjustRentAction, undefined)
  const [amount, setAmount] = useState(current.baseDollars.toFixed(2))
  const base = Math.round(Number(amount) * 100)
  const preview = Number.isFinite(base) && base > 0 ? formatCents(withProcessingFee(base)) : '—'

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="nonce" value={nonce} />

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          Base rent (USD)
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
          Frequency
          <select name="frequency" required defaultValue={current.frequency} className={inputClass}>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label className={labelClass}>
          Next draft date
          <input name="nextDraft" type="date" required min={minDate} defaultValue={current.nextDraft} className={inputClass} />
        </label>
      </div>

      <p className="text-xs text-olive-600 dark:text-olive-500">
        Tenant will be charged <strong>{preview}</strong> per draft (base + Stripe processing, which they cover). Nothing is
        charged before the next draft date; the new amount and frequency start then, and repeat from that date.
      </p>

      <label className={labelClass}>
        Reason (internal, optional)
        <input name="note" maxLength={500} placeholder="e.g. Income re-verified after new job" className={inputClass} />
      </label>

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
        {pending ? 'Updating Stripe…' : 'Save rent changes'}
      </Button>
    </form>
  )
}
