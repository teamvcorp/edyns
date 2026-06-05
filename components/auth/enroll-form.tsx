'use client'

import { useActionState } from 'react'
import { Button } from '@/components/elements/button'
import { enrollPartner, type EnrollState } from '@/app/actions/partners'

const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:placeholder:text-olive-400 dark:focus:ring-white'

function Field({
  label,
  name,
  state,
  type = 'text',
  autoComplete,
  placeholder,
  required = true,
  className,
}: {
  label: string
  name: string
  state: EnrollState
  type?: string
  autoComplete?: string
  placeholder?: string
  required?: boolean
  className?: string
}) {
  const error = state?.errors?.[name]
  return (
    <label className={`flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white ${className ?? ''}`}>
      {label}
      {required ? '' : <span className="font-normal text-olive-500"> (optional)</span>}
      <input
        type={type}
        name={name}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        defaultValue={type === 'password' ? undefined : state?.values?.[name]}
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

type PartnerAction = (prev: EnrollState, formData: FormData) => Promise<EnrollState>

export function EnrollForm({
  action = enrollPartner,
  mode = 'self',
}: {
  action?: PartnerAction
  mode?: 'self' | 'admin'
}) {
  const [state, formAction, pending] = useActionState(action, undefined)
  const admin = mode === 'admin'

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Account</legend>
        <Field label="Full name" name="name" state={state} autoComplete="name" placeholder="Jordan Rivera" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Email"
            name="email"
            type="email"
            state={state}
            autoComplete="email"
            placeholder="you@example.com"
          />
          <Field label="Phone" name="phone" type="tel" state={state} autoComplete="tel" placeholder="(555) 555-1234" />
        </div>
        <Field
          label={admin ? 'Temporary password' : 'Password'}
          name="password"
          type={admin ? 'text' : 'password'}
          state={state}
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Billing address</legend>
        <Field label="Street address" name="line1" state={state} autoComplete="address-line1" placeholder="123 Main St" />
        <Field
          label="Apartment, suite, etc."
          name="line2"
          state={state}
          required={false}
          autoComplete="address-line2"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" name="city" state={state} autoComplete="address-level2" />
          <Field label="State / region" name="state" state={state} autoComplete="address-level1" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Postal code" name="postalCode" state={state} autoComplete="postal-code" />
          <Field label="Country" name="country" state={state} autoComplete="country-name" placeholder="United States" />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Tax information</legend>
        <Field label="Tax ID (EIN or SSN)" name="taxId" state={state} autoComplete="off" placeholder="12-3456789" />
        <p className="text-xs text-olive-600 dark:text-olive-500">
          Your tax ID is encrypted and stored securely; only the last 4 digits are ever shown.
        </p>
      </fieldset>

      {state?.message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      {admin && (
        <p className="text-sm text-olive-600 dark:text-olive-500">
          The partner will be emailed their temporary password and a sign-in link. Property partners have no application
          fee.
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="w-full disabled:opacity-60">
        {pending ? 'Creating account…' : admin ? 'Create partner account' : 'Create partner account'}
      </Button>
    </form>
  )
}
