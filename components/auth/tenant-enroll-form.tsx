'use client'

import { useActionState, useState } from 'react'
import { Button, SoftButton, PlainButton } from '@/components/elements/button'
import { enrollTenant, type TenantEnrollState } from '@/app/actions/tenants'

const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:placeholder:text-olive-400'

function Field({
  label,
  name,
  state,
  type = 'text',
  required = true,
  placeholder,
  autoComplete,
  className,
}: {
  label: string
  name: string
  state: TenantEnrollState
  type?: string
  required?: boolean
  placeholder?: string
  autoComplete?: string
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
        autoComplete={autoComplete}
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

export function TenantEnrollForm() {
  const [state, formAction, pending] = useActionState(enrollTenant, undefined)
  const [adults, setAdults] = useState<Person[]>([])
  const [children, setChildren] = useState<Person[]>([])

  const cleanAdults = adults.filter((p) => p.name.trim() && p.dob)
  const cleanChildren = children.filter((p) => p.name.trim() && p.dob)

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="adults" value={JSON.stringify(cleanAdults)} />
      <input type="hidden" name="children" value={JSON.stringify(cleanChildren)} />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Head of household</legend>
        <Field label="Full name" name="name" state={state} autoComplete="name" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" name="email" type="email" state={state} autoComplete="email" />
          <Field label="Phone" name="phone" type="tel" state={state} autoComplete="tel" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date of birth" name="dob" type="date" state={state} />
          <Field label="Password" name="password" type="password" state={state} autoComplete="new-password" placeholder="At least 8 characters" />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Current address</legend>
        <Field label="Street address" name="line1" state={state} autoComplete="address-line1" />
        <Field label="Apartment, suite, etc." name="line2" state={state} required={false} autoComplete="address-line2" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" name="city" state={state} autoComplete="address-level2" />
          <Field label="State / region" name="state" state={state} autoComplete="address-level1" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Postal code" name="postalCode" state={state} autoComplete="postal-code" />
          <Field label="Country" name="country" state={state} autoComplete="country-name" placeholder="United States" />
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
          <Field label="Employer" name="employer" state={state} />
          <Field label="Job title" name="jobTitle" state={state} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Monthly income (USD)" name="monthlyIncome" type="number" state={state} />
          <Field label="Employer phone" name="employerPhone" type="tel" state={state} required={false} />
        </div>
      </fieldset>

      {state?.message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" disabled={pending} className="w-fit disabled:opacity-60">
          {pending ? 'Starting…' : 'Continue to payment'}
        </Button>
        <p className="text-sm text-olive-600 dark:text-olive-500">
          Next you’ll pay the <strong>$25 application fee</strong> (plus processing — you cover Stripe’s fee). Bank
          account preferred; card accepted. Your application stays pending until an admin approves it.
        </p>
      </div>
    </form>
  )
}
