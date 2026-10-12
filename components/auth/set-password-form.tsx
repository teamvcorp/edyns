'use client'

import { useActionState } from 'react'
import { Button } from '@/components/elements/button'
import { setPasswordAction, type SetPasswordState } from '@/app/actions/auth'

import { inputClass } from '@/components/elements/input'
const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white'

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState<SetPasswordState, FormData>(setPasswordAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className={labelClass}>
        New password
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="At least 8 characters"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Confirm new password
        <input
          type="password"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Re-enter your new password"
          className={inputClass}
        />
      </label>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full disabled:opacity-60">
        {pending ? 'Saving…' : 'Set new password'}
      </Button>
    </form>
  )
}
