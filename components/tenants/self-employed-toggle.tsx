'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/elements/button'
import { setSelfEmployment } from '@/app/actions/tenants'

/**
 * Lets a tenant mark themselves self-employed (cash/checks, no payroll). When on,
 * verification switches to bank deposits and weekly hours are implied from a
 * claimed hourly rate. Saving refreshes so the Plaid Link token rebuilds with the
 * right source types.
 */
export function SelfEmployedToggle({ selfEmployed, hourlyRate }: { selfEmployed: boolean; hourlyRate?: number }) {
  const router = useRouter()
  const [selfEmp, setSelfEmp] = useState(selfEmployed)
  const [rate, setRate] = useState(hourlyRate != null ? String(hourlyRate) : '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(nextSelf: boolean, nextRate: string) {
    setError(null)
    startTransition(async () => {
      const res = await setSelfEmployment(nextSelf, nextRate ? Number(nextRate) : null)
      if (res?.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-olive-950/5 p-3 dark:bg-white/5">
      <label className="flex items-center gap-2 text-sm text-olive-950 dark:text-white">
        <input
          type="checkbox"
          checked={selfEmp}
          disabled={pending}
          onChange={(e) => {
            setSelfEmp(e.target.checked)
            if (!e.target.checked) save(false, '')
          }}
        />
        I’m self-employed (paid in cash/checks, no payroll provider)
      </label>
      {selfEmp && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-olive-600 dark:text-olive-500">
            Your hourly rate — we estimate your weekly hours from this and your verified deposits.
          </span>
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="e.g. 22.00"
              className="w-32 rounded-lg bg-white/70 px-3 py-1.5 text-sm text-olive-950 ring-1 ring-olive-950/10 outline-none focus:ring-2 focus:ring-olive-950 dark:bg-white/10 dark:text-white dark:ring-white/10"
            />
            <Button type="button" onClick={() => save(true, rate)} disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </div>
  )
}
