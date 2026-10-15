'use client'

import { useActionState } from 'react'
import { Button } from '@/components/elements/button'
import { approveTenantIncomeAction, type AdminActionState } from '@/app/actions/admin'

const inputClass =
  // 16px on phones to avoid iOS focus-zoom — see components/elements/input.ts.
  'w-32 rounded-lg bg-olive-950/5 px-3 py-1.5 text-base text-olive-950 outline-none ring-1 ring-olive-950/10 focus:ring-2 focus:ring-olive-950 sm:text-sm dark:bg-white/5 dark:text-white dark:ring-white/10'

/**
 * Admin manually approves income after reviewing evidence themselves (uploaded
 * paystub, employer call). Enters the verified figures Plaid would otherwise set.
 */
export function IncomeVerifyForm({
  tenantId,
  requiredWeeklyHours,
  reportedMonthlyIncome,
}: {
  tenantId: string
  requiredWeeklyHours: number
  reportedMonthlyIncome: number
}) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(approveTenantIncomeAction, undefined)

  return (
    <form action={action} className="flex flex-col gap-3 border-t border-olive-950/10 pt-3 dark:border-white/10">
      <input type="hidden" name="id" value={tenantId} />
      <p className="text-sm font-medium text-olive-700 dark:text-olive-400">Manually verify income</p>
      <p className="text-xs text-olive-600 dark:text-olive-500">
        If you verified the tenant’s income yourself (reviewed the paystub above, called the employer), record the
        confirmed figures here. They feed the 40% rent suggestion and the {requiredWeeklyHours}-hour check, same as a
        Plaid verification.
      </p>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-xs text-olive-600 dark:text-olive-500">
          Gross monthly income (USD)
          <input
            name="monthlyIncome"
            type="number"
            min="1"
            step="0.01"
            inputMode="decimal"
            defaultValue={reportedMonthlyIncome > 0 ? String(reportedMonthlyIncome) : ''}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-olive-600 dark:text-olive-500">
          Hours worked per week
          <input name="weeklyHours" type="number" min="1" max="100" step="0.1" inputMode="decimal" className={inputClass} />
        </label>
      </div>
      <label className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-olive-950 ring-1 ring-amber-500/30 dark:text-white">
        <input type="checkbox" name="confirm" className="mt-1" />
        <span>I reviewed the income evidence myself. This bypasses Plaid verification.</span>
      </label>
      {state?.error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </span>
      )}
      <Button type="submit" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Saving…' : 'Approve income'}
      </Button>
    </form>
  )
}
