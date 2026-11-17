'use client'

import { useActionState } from 'react'
import { Button, SoftButton } from '@/components/elements/button'
import { inputClass } from '@/components/elements/input'
import {
  approveProgramChangeAction,
  declineProgramChangeAction,
  type ProgramChangeState,
} from '@/app/actions/program-change'

function Status({ state }: { state: ProgramChangeState }) {
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

/** Approve (switches program + re-prices fixed drafts) or decline (with a reason the tenant sees). */
export function ProgramChangeReview({ tenantId }: { tenantId: string }) {
  const [approveState, approve, approving] = useActionState<ProgramChangeState, FormData>(approveProgramChangeAction, undefined)
  const [declineState, decline, declining] = useActionState<ProgramChangeState, FormData>(declineProgramChangeAction, undefined)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-4">
        <form action={approve}>
          <input type="hidden" name="tenantId" value={tenantId} />
          <Button type="submit" disabled={approving || declining} className="disabled:opacity-60">
            {approving ? 'Approving…' : 'Approve change'}
          </Button>
        </form>
        <form action={decline} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="tenantId" value={tenantId} />
          <input name="reason" maxLength={500} placeholder="Reason (shown to tenant)" className={inputClass} />
          <SoftButton type="submit" disabled={approving || declining} className="text-red-600 dark:text-red-400">
            {declining ? 'Declining…' : 'Decline'}
          </SoftButton>
        </form>
      </div>
      <Status state={approveState} />
      <Status state={declineState} />
    </div>
  )
}
