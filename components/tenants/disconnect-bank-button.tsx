'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SoftButton } from '@/components/elements/button'
import { disconnectBankAction } from '@/app/actions/paychecks'

/**
 * Disconnect the paycheck bank (two-step confirm). The server refuses while
 * paycheck collection is active — an active program needs a payment source.
 */
export function DisconnectBankButton() {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-olive-950 dark:text-white">Disconnect this bank?</span>
          <SoftButton
            type="button"
            disabled={pending}
            className="text-red-600 dark:text-red-400"
            onClick={() =>
              startTransition(async () => {
                const res = await disconnectBankAction()
                setMessage(res ?? null)
                setConfirming(false)
                if (res?.ok) router.refresh()
              })
            }
          >
            {pending ? 'Disconnecting…' : 'Yes, disconnect'}
          </SoftButton>
          <SoftButton type="button" onClick={() => setConfirming(false)}>
            Cancel
          </SoftButton>
        </div>
      ) : (
        <SoftButton type="button" onClick={() => setConfirming(true)} className="w-fit">
          Disconnect bank
        </SoftButton>
      )}
      {message?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {message.error}
        </p>
      )}
    </div>
  )
}
