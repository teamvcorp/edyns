'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/elements/button'
import { acceptPaycheckAuthorization } from '@/app/actions/paychecks'

/**
 * The per-paycheck debit authorization. The text is built on the SERVER
 * (lib/paychecks.ts buildAuthorizationText) and re-built + stored verbatim when
 * accepted, so what's saved always matches the current rules — this component
 * only displays it and requires an explicit tick before accepting.
 */
export function PaycheckAuthorization({ text }: { text: string }) {
  const router = useRouter()
  const [agreed, setAgreed] = useState(false)
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-3">
      <blockquote className="rounded-xl bg-olive-950/5 px-4 py-3 text-sm/6 text-olive-950 dark:bg-white/5 dark:text-white">
        {text}
      </blockquote>
      <label className="flex items-start gap-2 text-sm text-olive-950 dark:text-white">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
        <span>I have read and agree to this authorization.</span>
      </label>
      <Button
        type="button"
        disabled={!agreed || pending}
        className="w-fit disabled:opacity-60"
        onClick={() =>
          startTransition(async () => {
            const res = await acceptPaycheckAuthorization()
            setMessage(res ?? null)
            if (res?.ok) router.refresh()
          })
        }
      >
        {pending ? 'Saving…' : 'Authorize paycheck collection'}
      </Button>
      {message?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {message.error}
        </p>
      )}
      {message?.ok && (
        <p role="status" className="text-sm text-olive-700 dark:text-olive-300">
          {message.ok}
        </p>
      )}
    </div>
  )
}
