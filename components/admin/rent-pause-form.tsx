'use client'

import { useActionState } from 'react'
import { Button, SoftButton } from '@/components/elements/button'
import { inputClass } from '@/components/elements/input'
import { pauseRentAction, resumeRentAction, type RentFormState } from '@/app/actions/rent'

const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white'

/**
 * Pause rent (Stripe voids drafts while paused — no charge, nothing owed) or
 * resume an admin pause. Prefer pausing over cancel + restart: the subscription,
 * payment method and history are kept.
 */
export function RentPauseForm({
  tenantId,
  nonce,
  minDate,
  paused,
}: {
  tenantId: string
  nonce: string
  /** Earliest auto-resume date (yyyy-mm-dd), from the server. */
  minDate: string
  /** Present when an ADMIN pause is on. */
  paused?: { since: string; reason?: string; resumesOn?: string }
}) {
  const [state, action, pending] = useActionState<RentFormState, FormData>(
    paused ? resumeRentAction : pauseRentAction,
    undefined,
  )

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="nonce" value={nonce} />

      {paused ? (
        <p className="text-sm text-olive-700 dark:text-olive-300">
          Paused since {paused.since}
          {paused.reason ? ` — ${paused.reason}` : ''}.{' '}
          {paused.resumesOn ? `Resumes automatically on ${paused.resumesOn}.` : 'Stays paused until you resume it.'}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Reason (internal, optional)
            <input name="reason" maxLength={500} placeholder="e.g. Hospital stay — paused 1 month" className={inputClass} />
          </label>
          <label className={labelClass}>
            Resume automatically on (optional)
            <input name="resumeOn" type="date" min={minDate} className={inputClass} />
          </label>
        </div>
      )}

      {!paused && (
        <p className="text-xs text-olive-600 dark:text-olive-500">
          While paused, Stripe voids each draft — the tenant isn’t charged and owes nothing for those periods. Use this
          instead of canceling; the subscription and payment method are kept. Leave the date blank to resume manually.
        </p>
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

      {paused ? (
        <Button type="submit" disabled={pending} className="w-fit disabled:opacity-60">
          {pending ? 'Resuming…' : 'Resume rent now'}
        </Button>
      ) : (
        <SoftButton type="submit" disabled={pending} className="w-fit disabled:opacity-60">
          {pending ? 'Pausing…' : 'Pause rent'}
        </SoftButton>
      )}
    </form>
  )
}
