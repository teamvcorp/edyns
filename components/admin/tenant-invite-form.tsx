'use client'

import { useActionState } from 'react'
import { Button } from '@/components/elements/button'
import { inviteTenantAction, type InviteState } from '@/app/actions/admin-invites'

import { inputClass } from '@/components/elements/input'

export type PropertyOption = { id: string; label: string }

export function TenantInviteForm({ properties }: { properties: PropertyOption[] }) {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(inviteTenantAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
        Name
        <input
          name="name"
          required
          maxLength={120}
          autoComplete="off"
          defaultValue={state?.values?.name}
          aria-invalid={state?.errors?.name ? true : undefined}
          className={inputClass}
        />
        {state?.errors?.name && (
          <span role="alert" className="text-xs font-normal text-red-600 dark:text-red-400">
            {state.errors.name}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="off"
          defaultValue={state?.values?.email}
          aria-invalid={state?.errors?.email ? true : undefined}
          className={inputClass}
        />
        {state?.errors?.email && (
          <span role="alert" className="text-xs font-normal text-red-600 dark:text-red-400">
            {state.errors.email}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
        <span>
          Property they found us through <span className="font-normal text-olive-500">(optional)</span>
        </span>
        <select name="propertyId" defaultValue={state?.values?.propertyId ?? ''} className={inputClass}>
          <option value="">None</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="text-xs font-normal text-olive-600 dark:text-olive-500">
          Shown in their email and on the application as reassurance. It does not reserve the home or file a move-in
          request.
        </span>
        {state?.errors?.propertyId && (
          <span role="alert" className="text-xs font-normal text-red-600 dark:text-red-400">
            {state.errors.propertyId}
          </span>
        )}
      </label>

      {state?.message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Sending…' : 'Send invite'}
      </Button>
    </form>
  )
}
