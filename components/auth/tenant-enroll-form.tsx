'use client'

import { useActionState, useState } from 'react'
import { Button, SoftButton, PlainButton } from '@/components/elements/button'
import { enrollTenant, type TenantEnrollState } from '@/app/actions/tenants'

import { inputClass } from '@/components/elements/input'

function Field({
  label,
  name,
  state,
  type = 'text',
  required = true,
  placeholder,
  autoComplete,
  inputMode,
  className,
  lockedValue,
}: {
  label: string
  name: string
  state: TenantEnrollState
  type?: string
  required?: boolean
  placeholder?: string
  autoComplete?: string
  /** Picks the right mobile keyboard (e.g. 'decimal' guarantees a numeric pad on iOS). */
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search'
  className?: string
  /** Server-supplied value the applicant can't change (invited name/email). */
  lockedValue?: string
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
        autoComplete={autoComplete}
        inputMode={inputMode}
        defaultValue={lockedValue ?? (type === 'password' ? undefined : state?.values?.[name])}
        readOnly={lockedValue !== undefined}
        aria-invalid={error ? true : undefined}
        className={lockedValue !== undefined ? `${inputClass} opacity-70` : inputClass}
      />
      {error && (
        <span role="alert" className="text-xs font-normal text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </label>
  )
}

type Person = { name: string; dob: string }

function PeopleEditor({
  legend,
  hint,
  people,
  setPeople,
  addLabel,
}: {
  legend: string
  hint: string
  people: Person[]
  setPeople: (p: Person[]) => void
  addLabel: string
}) {
  const update = (i: number, patch: Partial<Person>) =>
    setPeople(people.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold text-olive-700 dark:text-olive-400">{legend}</legend>
      <p className="text-xs text-olive-600 dark:text-olive-500">{hint}</p>
      {people.map((p, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-olive-950 dark:text-white">
            Name
            <input
              value={p.name}
              onChange={(e) => update(i, { name: e.target.value })}
              className={inputClass}
              placeholder="Full name"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-olive-950 dark:text-white">
            Date of birth
            <input type="date" value={p.dob} onChange={(e) => update(i, { dob: e.target.value })} className={inputClass} />
          </label>
          <PlainButton
            type="button"
            size="lg"
            onClick={() => setPeople(people.filter((_, idx) => idx !== i))}
            className="text-red-600 dark:text-red-400"
          >
            Remove
          </PlainButton>
        </div>
      ))}
      <SoftButton type="button" onClick={() => setPeople([...people, { name: '', dob: '' }])} className="w-fit">
        {addLabel}
      </SoftButton>
    </fieldset>
  )
}

type TenantAction = (prev: TenantEnrollState, formData: FormData) => Promise<TenantEnrollState>

export function TenantEnrollForm({
  action = enrollTenant,
  mode = 'self',
  invite,
  initialValues,
  stripeCustomer,
}: {
  action?: TenantAction
  mode?: 'self' | 'admin'
  /** Present when the applicant arrived via an emailed invite link. */
  invite?: { token: string; name: string; email: string }
  /** Admin prefill (e.g. demographics pulled from a Stripe customer). Inputs are
   *  uncontrolled, so remount the form (key) when these change after mount. */
  initialValues?: Record<string, string>
  /** Admin: link this existing Stripe customer (and their saved payment method). */
  stripeCustomer?: { id: string; paymentMethodLabel: string | null }
}) {
  const [state, formAction, pending] = useActionState(action, undefined)
  const [adults, setAdults] = useState<Person[]>([])
  const [children, setChildren] = useState<Person[]>([])
  const admin = mode === 'admin'
  // Fields repopulate from state.values after a validation error; before the
  // first submit, fall back to the prefill by presenting it as initial state.
  const fieldState = state ?? (initialValues ? { values: initialValues } : undefined)

  const cleanAdults = adults.filter((p) => p.name.trim() && p.dob)
  const cleanChildren = children.filter((p) => p.name.trim() && p.dob)

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="adults" value={JSON.stringify(cleanAdults)} />
      <input type="hidden" name="children" value={JSON.stringify(cleanChildren)} />
      {invite && <input type="hidden" name="inviteToken" value={invite.token} />}
      {admin && stripeCustomer && <input type="hidden" name="stripeCustomerId" value={stripeCustomer.id} />}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Head of household</legend>
        <Field label="Full name" name="name" state={fieldState} autoComplete="name" lockedValue={invite?.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" name="email" type="email" state={fieldState} autoComplete="email" lockedValue={invite?.email} />
          <Field label="Phone" name="phone" type="tel" state={fieldState} autoComplete="tel" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date of birth" name="dob" type="date" state={fieldState} />
          <Field
            label={admin ? 'Temporary password' : 'Password'}
            name="password"
            type={admin ? 'text' : 'password'}
            state={fieldState}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Current address</legend>
        <Field label="Street address" name="line1" state={fieldState} autoComplete="address-line1" />
        <Field label="Apartment, suite, etc." name="line2" state={fieldState} required={false} autoComplete="address-line2" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" name="city" state={fieldState} autoComplete="address-level2" />
          <Field label="State / region" name="state" state={fieldState} autoComplete="address-level1" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Postal code" name="postalCode" state={fieldState} autoComplete="postal-code" />
          <Field label="Country" name="country" state={fieldState} autoComplete="country-name" placeholder="United States" />
        </div>
      </fieldset>

      <PeopleEditor
        legend="Other adults (18+)"
        hint="Add every household member 18 or older besides the head of household."
        people={adults}
        setPeople={setAdults}
        addLabel="Add adult"
      />

      <PeopleEditor
        legend="Children (under 18)"
        hint="Name and date of birth for each child."
        people={children}
        setPeople={setChildren}
        addLabel="Add child"
      />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Employment</legend>
        <p className="text-xs text-olive-600 dark:text-olive-500">
          We’ll verify employment and income through Plaid in a later step.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employer" name="employer" state={fieldState} />
          <Field label="Job title" name="jobTitle" state={fieldState} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Monthly income (USD)" name="monthlyIncome" type="number" inputMode="decimal" state={fieldState} />
          <Field label="Employer phone" name="employerPhone" type="tel" state={fieldState} required={false} />
        </div>
      </fieldset>

      {admin && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold text-olive-700 dark:text-olive-400">Payment & fee</legend>
          {stripeCustomer ? (
            <p className="text-sm text-olive-600 dark:text-olive-500">
              Linked to Stripe customer <code className="text-olive-950 dark:text-white">{stripeCustomer.id}</code>
              {stripeCustomer.paymentMethodLabel
                ? ` — saved payment method (${stripeCustomer.paymentMethodLabel}) will be imported for rent drafts.`
                : ' — no saved payment method found; one is still needed (fee checkout, or add it in Stripe) before rent can draft.'}
            </p>
          ) : (
            <p className="text-sm text-olive-600 dark:text-olive-500">
              No Stripe customer linked — one is created when the tenant pays the fee in the app. To link an existing
              customer, use “Prefill from Stripe” above.
            </p>
          )}
          <label className="flex items-start gap-2 text-sm text-olive-950 dark:text-white">
            <input type="checkbox" name="feeCollected" className="mt-1" />
            <span>
              The $25 application fee was already collected outside the app (cash or directly in Stripe) — mark it paid
              and skip the in-app fee checkout.
            </span>
          </label>
        </fieldset>
      )}

      {state?.message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" disabled={pending} className="w-full disabled:opacity-60 sm:w-fit">
          {pending ? (admin ? 'Creating…' : 'Starting…') : admin ? 'Create tenant account' : 'Continue to payment'}
        </Button>
        {admin ? (
          <p className="text-sm text-olive-600 dark:text-olive-500">
            The tenant will be emailed their temporary password and a sign-in link. Their first step is to sign in and
            pay the <strong>$25 application fee</strong> (unless marked collected above). The application stays pending
            until paid and approved.
          </p>
        ) : (
          <>
            <p className="text-sm text-olive-600 dark:text-olive-500">
              Next you’ll pay the <strong>$25 application fee</strong> (plus processing). Bank account preferred; card
              accepted. Your application stays pending until an admin approves it.
            </p>
            <p className="text-xs text-olive-600 dark:text-olive-500">
              By continuing you agree to cover all third-party processing fees: Stripe fees on the application fee and
              your ongoing rent collection, and any Plaid fees for income verification. These are added to the amounts
              charged to you.
            </p>
          </>
        )}
      </div>
    </form>
  )
}
