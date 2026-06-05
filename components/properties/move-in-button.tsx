'use client'

import { useActionState } from 'react'
import { Button } from '@/components/elements/button'
import { requestMoveIn, type MoveInState } from '@/app/actions/moveins'

export function MoveInButton({ propertyId }: { propertyId: string }) {
  const [state, action, pending] = useActionState<MoveInState, FormData>(requestMoveIn, undefined)

  if (state?.ok) {
    return <p className="text-sm font-medium text-olive-700 dark:text-olive-300">Request submitted — we’ll be in touch.</p>
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <Button type="submit" size="lg" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Submitting…' : 'Request to move in'}
      </Button>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  )
}
