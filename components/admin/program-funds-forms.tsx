'use client'

import { useActionState } from 'react'
import { Button } from '@/components/elements/button'
import { inputClass } from '@/components/elements/input'
import {
  recordLandlordPaymentAction,
  recordLedgerAdjustmentAction,
  type FundsFormState,
} from '@/app/actions/program-funds'

const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white'

function Status({ state }: { state: FundsFormState }) {
  if (state?.error)
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {state.error}
      </p>
    )
  if (state?.ok)
    return (
      <p role="status" className="text-sm text-olive-700 dark:text-olive-300">
        {state.ok}
      </p>
    )
  return null
}

/**
 * Record rent staff sent to the tenant's outside landlord. The payment itself
 * happens outside the app (bill pay / ACH / check); this keeps the books.
 * `nonce` (server-rendered randomUUID) makes a double-submit a no-op.
 */
export function LandlordPaymentForm({
  tenantId,
  nonce,
  today,
  suggestedDollars,
}: {
  tenantId: string
  nonce: string
  /** yyyy-mm-dd, computed on the server (no clock reads during render). */
  today: string
  suggestedDollars?: number
}) {
  const [state, action, pending] = useActionState<FundsFormState, FormData>(recordLandlordPaymentAction, undefined)
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="nonce" value={nonce} />
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          Amount paid (USD)
          <input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            defaultValue={suggestedDollars ? suggestedDollars.toFixed(2) : undefined}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Date sent
          <input name="paidOn" type="date" required max={today} defaultValue={today} className={inputClass} />
        </label>
        <label className={labelClass}>
          Method
          <select name="method" required defaultValue="bill_pay" className={inputClass}>
            <option value="bill_pay">Bill pay</option>
            <option value="ach">ACH transfer</option>
            <option value="check">Check</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Reference (optional)
          <input name="reference" maxLength={300} placeholder="Check # or confirmation code" className={inputClass} />
        </label>
        <label className={labelClass}>
          Note (optional)
          <input name="note" maxLength={300} placeholder="e.g. December rent" className={inputClass} />
        </label>
      </div>
      <Status state={state} />
      <Button type="submit" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Saving…' : 'Record landlord payment'}
      </Button>
    </form>
  )
}

/** Signed correction to a bucket, with a required reason (kept in history). */
export function LedgerAdjustmentForm({
  tenantId,
  nonce,
  buckets,
}: {
  tenantId: string
  nonce: string
  buckets: ('rent' | 'car')[]
}) {
  const [state, action, pending] = useActionState<FundsFormState, FormData>(recordLedgerAdjustmentAction, undefined)
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="nonce" value={nonce} />
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          Bucket
          <select name="bucket" required defaultValue={buckets[0]} className={inputClass}>
            {buckets.includes('rent') && <option value="rent">Rent held</option>}
            {buckets.includes('car') && <option value="car">Car savings</option>}
          </select>
        </label>
        <label className={labelClass}>
          Amount (USD, negative to reduce)
          <input name="amount" type="number" step="0.01" required className={inputClass} />
        </label>
        <label className={labelClass}>
          Reason
          <input name="note" maxLength={300} required placeholder="Why this changed" className={inputClass} />
        </label>
      </div>
      <Status state={state} />
      <Button type="submit" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Saving…' : 'Record adjustment'}
      </Button>
    </form>
  )
}
