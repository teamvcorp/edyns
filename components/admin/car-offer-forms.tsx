'use client'

import { useActionState } from 'react'
import { Button } from '@/components/elements/button'
import { inputClass } from '@/components/elements/input'
import { createCarOfferAction, markCarPurchasedAction, type CarOfferFormState } from '@/app/actions/car-offers'

const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white'

function Status({ state }: { state: CarOfferFormState }) {
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

/** Offer an available vehicle that fits the tenant's car savings (server re-checks the balance). */
export function CarOfferForm({ tenantId, maxDollars }: { tenantId: string; maxDollars: number }) {
  const [state, action, pending] = useActionState<CarOfferFormState, FormData>(createCarOfferAction, undefined)
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={`${labelClass} sm:col-span-2`}>
          Vehicle
          <input
            name="vehicle"
            required
            minLength={3}
            maxLength={200}
            placeholder="2019 Honda Civic LX, 62k miles"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Price (USD)
          <input name="price" type="number" min="1" step="0.01" max={maxDollars} required className={inputClass} />
        </label>
      </div>
      <label className={labelClass}>
        Notes for the tenant (optional)
        <input name="notes" maxLength={500} placeholder="Where to see it, condition, next steps" className={inputClass} />
      </label>
      <Status state={state} />
      <Button type="submit" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Sending…' : 'Send car offer'}
      </Button>
    </form>
  )
}

/** Accepted offer → car bought: releases the price from car savings (ledger car_release). */
export function MarkCarPurchasedForm({ offerId }: { offerId: string }) {
  const [state, action, pending] = useActionState<CarOfferFormState, FormData>(markCarPurchasedAction, undefined)
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="offerId" value={offerId} />
      <Status state={state} />
      <Button type="submit" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Saving…' : 'Mark purchased & release savings'}
      </Button>
    </form>
  )
}
