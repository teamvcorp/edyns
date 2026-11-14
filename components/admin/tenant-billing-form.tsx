'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/elements/button'
import { startTenantBillingAction, type AdminActionState } from '@/app/actions/admin'
import { ProgramAmountFields } from '@/components/admin/program-amount-fields'
import { PROGRAMS, rateSummary, type ProgramId } from '@/lib/programs'
import type { BillingFrequency } from '@/lib/tenants'

import { inputClass } from '@/components/elements/input'
const labelClass = 'text-sm font-medium text-olive-950 dark:text-white'

/**
 * Start recurring collection for an approved, income-verified tenant. Amounts
 * follow the tenant's program (lib/programs.ts) and are pre-filled from
 * verified income converted to the chosen frequency.
 */
export function TenantBillingForm({
  tenantId,
  program,
  monthlyIncome,
}: {
  tenantId: string
  program: ProgramId
  /** Verified monthly income (dollars), used for the suggested amounts. */
  monthlyIncome?: number
}) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(startTenantBillingAction, undefined)
  const [frequency, setFrequency] = useState<BillingFrequency | ''>('')

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={tenantId} />

      <p className="text-sm text-olive-700 dark:text-olive-400">
        {PROGRAMS[program].label}: collects {rateSummary(program)} of pay.
      </p>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>Draft frequency</span>
        <select
          name="frequency"
          required
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as BillingFrequency | '')}
          className={inputClass}
        >
          <option value="" disabled>
            Select frequency…
          </option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every 2 weeks</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>

      <ProgramAmountFields program={program} frequency={frequency} monthlyIncome={monthlyIncome} autoSuggest />

      <label className="flex flex-col gap-1">
        <span className={labelClass}>First draft date</span>
        <input name="firstDraft" type="date" required className={inputClass} />
      </label>

      <p className="text-xs text-olive-600 dark:text-olive-500">
        Choosing a frequency fills in the amounts from verified income for that schedule. Adjust them if needed. Drafts
        start on the first draft date and repeat on the schedule above.
      </p>

      {state?.error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </span>
      )}

      <Button type="submit" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Starting…' : 'Start collection'}
      </Button>
    </form>
  )
}
