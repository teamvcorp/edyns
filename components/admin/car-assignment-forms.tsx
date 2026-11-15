'use client'

import { useActionState } from 'react'
import { Button } from '@/components/elements/button'
import { inputClass } from '@/components/elements/input'
import { assignCarAction, returnCarAction, type CarFormState } from '@/app/actions/car-assignments'

const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white'

function Status({ state }: { state: CarFormState }) {
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

/** Provide an edynsgate-owned car. The server enforces the trust period unless "early" is ticked. */
export function AssignCarForm({ tenantId, trusted }: { tenantId: string; trusted: boolean }) {
  const [state, action, pending] = useActionState<CarFormState, FormData>(assignCarAction, undefined)
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <label className={labelClass}>
        Vehicle
        <input name="vehicle" required minLength={3} maxLength={200} placeholder="2019 Honda Civic LX, silver" className={inputClass} />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          VIN (optional)
          <input name="vin" maxLength={100} className={inputClass} />
        </label>
        <label className={labelClass}>
          Plate (optional)
          <input name="plate" maxLength={100} className={inputClass} />
        </label>
        <label className={labelClass}>
          Insurance (optional)
          <input name="insurance" maxLength={200} placeholder="Insurer + policy #" className={inputClass} />
        </label>
      </div>
      <label className={labelClass}>
        Notes (optional)
        <input name="notes" maxLength={500} placeholder="Pickup details, condition" className={inputClass} />
      </label>
      {!trusted && (
        <label className="flex items-start gap-2 text-sm text-olive-950 dark:text-white">
          <input type="checkbox" name="early" className="mt-1" />
          <span>Provide early — before the trust period ends.</span>
        </label>
      )}
      <Status state={state} />
      <Button type="submit" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Saving…' : 'Assign car'}
      </Button>
    </form>
  )
}

/** Car comes back (stopped paying / left the program). */
export function ReturnCarForm({ assignmentId }: { assignmentId: string }) {
  const [state, action, pending] = useActionState<CarFormState, FormData>(returnCarAction, undefined)
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <label className={labelClass}>
        Reason for return
        <input name="reason" required maxLength={500} placeholder="e.g. Stopped paying, left the program" className={inputClass} />
      </label>
      <Status state={state} />
      <Button type="submit" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Saving…' : 'Mark car returned'}
      </Button>
    </form>
  )
}
