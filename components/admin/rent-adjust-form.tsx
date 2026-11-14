'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/elements/button'
import { inputClass } from '@/components/elements/input'
import { adjustRentAction, restartRentAction, type RentFormState } from '@/app/actions/rent'
import { ProgramAmountFields } from '@/components/admin/program-amount-fields'
import type { ProgramId } from '@/lib/programs'
import type { BillingFrequency } from '@/lib/tenants'

const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white'

/**
 * mode 'adjust': change amount / frequency / next draft date of live rent.
 *   No proration: the new terms start on the chosen date.
 * mode 'restart': start a NEW subscription for canceled rent (Stripe can't
 *   reactivate a canceled one); first draft on the chosen date.
 * `nonce` is a one-time id from the server render — the Stripe idempotency key.
 */
export function RentAdjustForm({
  tenantId,
  nonce,
  current,
  minDate,
  mode = 'adjust',
  program,
  monthlyIncome,
}: {
  tenantId: string
  nonce: string
  /** Current per-draft base amounts (dollars) split into rent and car savings. */
  current: { rentDollars: number; carDollars: number; frequency: BillingFrequency; nextDraft: string }
  /** Earliest selectable next draft (yyyy-mm-dd), computed on the server. The action re-checks it. */
  minDate: string
  mode?: 'adjust' | 'restart'
  program: ProgramId
  /** Verified monthly income (dollars) for the "suggest" button. */
  monthlyIncome?: number
}) {
  const restart = mode === 'restart'
  const [state, action, pending] = useActionState<RentFormState, FormData>(
    restart ? restartRentAction : adjustRentAction,
    undefined,
  )
  const [frequency, setFrequency] = useState<BillingFrequency>(current.frequency)

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="nonce" value={nonce} />

      <ProgramAmountFields
        program={program}
        frequency={frequency}
        monthlyIncome={monthlyIncome}
        initial={{ rent: current.rentDollars, car: current.carDollars }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Frequency
          <select
            name="frequency"
            required
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as BillingFrequency)}
            className={inputClass}
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label className={labelClass}>
          {restart ? 'First draft date' : 'Next draft date'}
          <input name="nextDraft" type="date" required min={minDate} defaultValue={current.nextDraft} className={inputClass} />
        </label>
      </div>

      <p className="text-xs text-olive-600 dark:text-olive-500">
        Nothing is charged before the {restart ? 'first' : 'next'} draft date; {restart ? 'drafts' : 'the new amount and frequency'}{' '}
        start then and repeat from that date.
        {restart && ' A new Stripe subscription is created on the tenant’s saved payment method.'}
      </p>

      {!restart && (
        <label className={labelClass}>
          Reason (internal, optional)
          <input name="note" maxLength={500} placeholder="e.g. Income re-verified after new job" className={inputClass} />
        </label>
      )}

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
        {pending ? 'Updating Stripe…' : restart ? 'Restart rent collection' : 'Save rent changes'}
      </Button>
    </form>
  )
}
