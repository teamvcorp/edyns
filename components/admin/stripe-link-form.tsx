'use client'

import { useActionState } from 'react'
import { SoftButton } from '@/components/elements/button'
import { inputClass } from '@/components/elements/input'
import { linkStripeAction, type RentFormState } from '@/app/actions/rent'

const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white'

/**
 * Admin: link a tenant to an existing Stripe customer and payment method.
 * Everything is verified against Stripe on the server (see linkStripeAction).
 */
export function StripeLinkForm({ tenantId, customerId }: { tenantId: string; customerId?: string }) {
  const [state, action, pending] = useActionState<RentFormState, FormData>(linkStripeAction, undefined)

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="tenantId" value={tenantId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Stripe customer ID
          <input
            name="customerId"
            required
            defaultValue={customerId ?? ''}
            placeholder="cus_…"
            autoComplete="off"
            className={`font-mono ${inputClass}`}
          />
        </label>
        <label className={labelClass}>
          Payment method ID (optional)
          <input name="paymentMethodId" placeholder="pm_… — blank = customer’s default" autoComplete="off" className={`font-mono ${inputClass}`} />
        </label>
      </div>
      <p className="text-xs text-olive-600 dark:text-olive-500">
        Find both in the Stripe dashboard → Customers → the customer (ID at the top; payment methods listed below). The
        payment method must already be attached to that customer.
      </p>

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

      <SoftButton type="submit" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Checking with Stripe…' : 'Link Stripe customer'}
      </SoftButton>
    </form>
  )
}
