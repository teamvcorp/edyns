'use client'

import { useActionState } from 'react'
import { Button } from '@/components/elements/button'
import type { AuthState } from '@/app/actions/auth'

type Action = (prev: AuthState, formData: FormData) => Promise<AuthState>

import { inputClass } from '@/components/elements/input'

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
