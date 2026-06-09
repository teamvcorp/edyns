'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/elements/button'
import { setTenantEmploymentTypeAction, type AdminActionState } from '@/app/actions/admin'

const inputClass =
  'w-32 rounded-lg bg-olive-950/5 px-3 py-1.5 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10'

/** Admin override of a tenant's employment type (self-employed + claimed hourly rate). */
export function EmploymentTypeForm({
  tenantId,
  selfEmployed,
  hourlyRate,
}: {
  tenantId: string
  selfEmployed: boolean
  hourlyRate?: number
}) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(setTenantEmploymentTypeAction, undefined)
  const [selfEmp, setSelfEmp] = useState(selfEmployed)

  return (
    <form action={action} className="flex flex-col gap-2 border-t border-olive-950/10 pt-3 dark:border-white/10">
      <input type="hidden" name="id" value={tenantId} />
      <label className="flex items-center gap-2 text-sm text-olive-950 dark:text-white">
        <input type="checkbox" name="selfEmployed" checked={selfEmp} onChange={(e) => setSelfEmp(e.target.checked)} />
        Self-employed (verify via bank deposits, hours implied from rate)
      </label>
      {selfEmp && (
        <label className="flex flex-col gap-1 text-xs text-olive-600 dark:text-olive-500">
          Claimed hourly rate
          <input
            name="hourlyRate"
            type="number"
            min="1"
            step="0.01"
            defaultValue={hourlyRate != null ? String(hourlyRate) : ''}
            className={inputClass}
          />
        </label>
      )}
      {state?.error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </span>
      )}
      <Button type="submit" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Saving…' : 'Save employment type'}
      </Button>
    </form>
  )
}
