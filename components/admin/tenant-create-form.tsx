'use client'

import { useActionState } from 'react'
import { SoftButton } from '@/components/elements/button'
import { inputClass } from '@/components/elements/input'
import { TenantEnrollForm } from '@/components/auth/tenant-enroll-form'
import {
  createTenantByAdmin,
  lookupStripeCustomerAction,
  type CustomerLookupState,
} from '@/app/actions/admin-create'

/**
 * Admin add-tenant: an optional Stripe customer lookup that prefills the
 * application form with the customer's demographics and links their saved
 * payment method. The enroll form's inputs are uncontrolled, so a successful
 * lookup remounts it (key) to apply the prefill.
 */
export function AdminTenantCreateForm() {
  const [lookup, lookupAction, looking] = useActionState<CustomerLookupState, FormData>(
    lookupStripeCustomerAction,
    undefined,
  )
  const found = lookup && 'customerId' in lookup ? lookup : undefined

  return (
    <div className="flex flex-col gap-8">
      <form action={lookupAction} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
          <span>
            Prefill from Stripe <span className="font-normal text-olive-500">(optional)</span>
          </span>
          <div className="flex flex-wrap gap-2">
            <input
              name="customerId"
              placeholder="cus_…"
              defaultValue={found?.customerId}
              className={`${inputClass} min-w-48 flex-1`}
            />
            <SoftButton type="submit" disabled={looking}>
              {looking ? 'Looking…' : 'Look up'}
            </SoftButton>
          </div>
        </label>
        <p className="text-xs text-olive-600 dark:text-olive-500">
          Paste the tenant’s Stripe customer id to pull their name, contact details, address, and saved payment method.
          You still complete date of birth, household, and employment below.
        </p>
        {lookup && 'error' in lookup && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {lookup.error}
          </p>
        )}
        {found && (
          <p role="status" className="text-sm text-olive-700 dark:text-olive-300">
            Found {found.values.name || 'customer'} ({found.customerId})
            {found.paymentMethodLabel ? ` — payment method on file: ${found.paymentMethodLabel}.` : ' — no saved payment method.'}{' '}
            Review the prefilled form below.
          </p>
        )}
      </form>

      <TenantEnrollForm
        key={found?.customerId ?? 'blank'}
        action={createTenantByAdmin}
        mode="admin"
        initialValues={found?.values}
        stripeCustomer={found ? { id: found.customerId, paymentMethodLabel: found.paymentMethodLabel } : undefined}
      />
    </div>
  )
}
