'use client'

import { useId, useState } from 'react'
import Image from 'next/image'
import { upload } from '@vercel/blob/client'

export function ImageUploader({
  label,
  multiple = false,
  value,
  onChange,
  pathPrefix = 'properties',
  uploadUrl = '/api/partners/upload',
}: {
  label: string
  multiple?: boolean
  value: string[]
  onChange: (urls: string[]) => void
  /** Blob path prefix, e.g. 'properties' or 'invoices'. */
  pathPrefix?: string
  /** Route that issues the client upload token (must allow the caller's role). */
  uploadUrl?: string
}) {
  const inputId = useId()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      const uploaded: string[] = []
      for (const file of Array.from(files)) {
        const blob = await upload(`${pathPrefix}/${file.name}`, file, {
          access: 'public',
          handleUploadUrl: uploadUrl,
        })
        uploaded.push(blob.url)
      }
      onChange(multiple ? [...value, ...uploaded] : uploaded.slice(-1))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  function remove(url: string) {
    onChange(value.filter((u) => u !== url))
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-olive-950 dark:text-white">{label}</span>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {value.map((url) => (
            <div key={url} className="relative size-24 overflow-hidden rounded-lg ring-1 ring-olive-950/10 dark:ring-white/10">
              <Image src={url} alt="" fill sizes="96px" className="object-cover" />
              <button
                type="button"
                onClick={() => remove(url)}
                aria-label="Remove image"
                className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-olive-950/70 text-white hover:bg-olive-950"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <label
        htmlFor={inputId}
        className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full bg-olive-950/5 px-4 py-2 text-sm font-medium text-olive-950 hover:bg-olive-950/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
      >
        {uploading ? 'Uploading…' : multiple ? 'Add images' : value.length ? 'Replace image' : 'Upload image'}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        multiple={multiple}
        disabled={uploading}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </div>
  )
}
