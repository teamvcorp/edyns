'use client'

import { useActionState } from 'react'
import { Button, SoftButton } from '@/components/elements/button'
import { inputClass } from '@/components/elements/input'
import {
  switchToPaycheckModeAction,
  pausePaycheckAction,
  resumePaycheckAction,
  syncNowAction,
  fetchStatementsAction,
  analyzeStatementsAction,
  type PaycheckActionResult,
} from '@/app/actions/paychecks'

const ACTIONS = {
  switch: switchToPaycheckModeAction,
  pause: pausePaycheckAction,
  resume: resumePaycheckAction,
  sync: syncNowAction,
  fetchStatements: fetchStatementsAction,
  analyze: analyzeStatementsAction,
} as const

/**
 * One admin button wired to a paycheck/statement server action (each action
 * re-checks the admin role + feature flag on the server). `withReason` adds a
 * reason field (pause); `withForce` a "re-read" checkbox (AI analysis).
 */
export function PaycheckActionForm({
  action,
  tenantId,
  label,
  soft = false,
  withReason = false,
  withForce = false,
}: {
  action: keyof typeof ACTIONS
  tenantId: string
  label: string
  soft?: boolean
  withReason?: boolean
  withForce?: boolean
}) {
  const [state, formAction, pending] = useActionState<PaycheckActionResult, FormData>(ACTIONS[action], undefined)
  const Btn = soft ? SoftButton : Button
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="tenantId" value={tenantId} />
      {withReason && (
        <input name="reason" maxLength={300} placeholder="Reason (internal)" className={inputClass} />
      )}
      {withForce && (
        <label className="flex items-center gap-2 text-xs text-olive-700 dark:text-olive-300">
          <input type="checkbox" name="force" /> Re-read statements already analyzed
        </label>
      )}
      <Btn type="submit" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Working…' : label}
      </Btn>
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
    </form>
  )
}
