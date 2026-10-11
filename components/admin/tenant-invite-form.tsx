'use client'

import { useActionState } from 'react'
import { Button } from '@/components/elements/button'
import { inviteTenantAction, type InviteState } from '@/app/actions/admin-invites'

const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:placeholder:text-olive-400'

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
