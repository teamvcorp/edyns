'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'
import { savePaystub } from '@/app/actions/tenants'

/** Upload the most recent paystub (PDF or image) as an alternative to Plaid. */
export function PaystubUploader({ currentUrl }: { currentUrl?: string }) {
  const inputId = useId()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const blob = await upload(`paystubs/${file.name}`, file, {
        access: 'public',
        handleUploadUrl: '/api/tenants/upload',
      })
      const res = await savePaystub(blob.url)
      if (res?.error) setError(res.error)
      else startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {currentUrl && (
        <a
          href={currentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-olive-700 underline dark:text-olive-300"
        >
          View uploaded paystub
        </a>
      )}
      <label
        htmlFor={inputId}
        className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full bg-olive-950/5 px-4 py-2 text-sm font-medium text-olive-950 hover:bg-olive-950/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
      >
        {busy ? 'Uploading…' : currentUrl ? 'Replace paystub' : 'Upload paystub'}
      </label>
      <input
        id={inputId}
        type="file"
        accept="application/pdf,image/*"
        disabled={busy}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </div>
  )
}
