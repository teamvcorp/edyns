'use client'

import { useActionState } from 'react'
import { Button } from '@/components/elements/button'
import { updatePartnerAction, type PartnerEditState } from '@/app/actions/admin'
import type { PartnerProfile } from '@/lib/users'

const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:placeholder:text-olive-400'

function Field({
  label,
  name,
  state,
  initial,
  required = true,
  type = 'text',
  placeholder,
  className,
}: {
  label: string
  name: string
  state: PartnerEditState
  initial?: string
  required?: boolean
  type?: string
  placeholder?: string
  className?: string
}) {
  const error = state?.errors?.[name]
  return (
    <label className={`flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white ${className ?? ''}`}>
      <span>
        {label}
        {required ? '' : <span className="font-normal text-olive-500"> (optional)</span>}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        defaultValue={state?.values?.[name] ?? initial}
        aria-invalid={error ? true : undefined}
        className={inputClass}
      />
      {error && (
        <span role="alert" className="text-xs font-normal text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </label>
  )
}

export function PartnerEditForm({ partner }: { partner: PartnerProfile }) {
  const [state, formAction, pending] = useActionState(updatePartnerAction, undefined)
  const a = partner.billingAddress

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="id" value={partner.id} />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Account</legend>
        <Field label="Full name" name="name" state={state} initial={partner.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" name="email" type="email" state={state} initial={partner.email} />
          <Field label="Phone" name="phone" type="tel" state={state} initial={partner.phone} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Billing address</legend>
        <Field label="Street address" name="line1" state={state} initial={a?.line1} />
        <Field label="Apartment, suite, etc." name="line2" state={state} initial={a?.line2} required={false} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" name="city" state={state} initial={a?.city} />
          <Field label="State / region" name="state" state={state} initial={a?.state} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Postal code" name="postalCode" state={state} initial={a?.postalCode} />
          <Field label="Country" name="country" state={state} initial={a?.country} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Tax information</legend>
        <Field
          label="Tax ID (EIN or SSN)"
          name="taxId"
          state={state}
          required={false}
          placeholder={partner.taxIdLast4 ? `Leave blank to keep •••• ${partner.taxIdLast4}` : 'Not on file'}
        />
      </fieldset>

      {state?.message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
      {state?.ok && <p className="text-sm text-olive-700 dark:text-olive-300">Saved.</p>}

      <Button type="submit" size="lg" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  )
}
