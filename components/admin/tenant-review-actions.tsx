'use client'

import { useActionState } from 'react'
import { Button, SoftButton } from '@/components/elements/button'
import { approveTenantAction, rejectTenantAction, type AdminActionState } from '@/app/actions/admin'

const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10'

export function TenantReviewActions({ tenantId, feePaid }: { tenantId: string; feePaid: boolean }) {
  const [approveState, approveAction, approving] = useActionState<AdminActionState, FormData>(
    approveTenantAction,
    undefined,
  )
  const [rejectState, rejectAction, rejecting] = useActionState<AdminActionState, FormData>(
    rejectTenantAction,
    undefined,
  )

  return (
    <div className="flex flex-col gap-4">
      {!feePaid && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Heads up: the application fee isn’t paid yet.
        </p>
      )}

      <form action={approveAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={tenantId} />
        {approveState?.error && (
          <span role="alert" className="text-xs text-red-600 dark:text-red-400">
            {approveState.error}
          </span>
        )}
        <Button type="submit" disabled={approving} className="w-fit disabled:opacity-60">
          {approving ? 'Approving…' : 'Approve application'}
        </Button>
      </form>

      <form action={rejectAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={tenantId} />
        <input name="reason" placeholder="Reason for rejection (optional)" className={inputClass} />
        {rejectState?.error && (
          <span role="alert" className="text-xs text-red-600 dark:text-red-400">
            {rejectState.error}
          </span>
        )}
        <SoftButton type="submit" disabled={rejecting} className="w-fit text-red-600 disabled:opacity-60 dark:text-red-400">
          {rejecting ? 'Rejecting…' : 'Reject'}
        </SoftButton>
      </form>
    </div>
  )
}
