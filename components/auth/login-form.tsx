'use client'

import { useActionState } from 'react'
import { Button } from '@/components/elements/button'
import type { AuthState } from '@/app/actions/auth'

type Action = (prev: AuthState, formData: FormData) => Promise<AuthState>

const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:placeholder:text-olive-400 dark:focus:ring-white'

const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white'

export function LoginForm({
  action,
  variant = 'credentials',
  submitLabel = 'Log in',
}: {
  action: Action
  variant?: 'credentials' | 'password'
  submitLabel?: string
}) {
  const [state, formAction, pending] = useActionState(action, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {variant === 'credentials' && (
        <label className={labelClass}>
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className={inputClass}
          />
        </label>
      )}

      <label className={labelClass}>
        Password
        <input
          type="password"
          name="password"
          autoComplete={variant === 'credentials' ? 'current-password' : 'off'}
          required
          placeholder="••••••••"
          className={inputClass}
        />
      </label>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full disabled:opacity-60">
        {pending ? 'Please wait…' : submitLabel}
      </Button>
    </form>
  )
}
