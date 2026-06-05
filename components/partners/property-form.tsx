'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/elements/button'
import { ImageUploader } from './image-uploader'
import { addProperty, type PropertyFormState } from '@/app/actions/properties'

const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:placeholder:text-olive-400 dark:focus:ring-white'

function Field({
  label,
  name,
  state,
  type = 'text',
  placeholder,
  required = true,
  inputMode,
  step,
  className,
}: {
  label: string
  name: string
  state: PropertyFormState
  type?: string
  placeholder?: string
  required?: boolean
  inputMode?: 'numeric' | 'decimal'
  step?: string
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
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        step={step}
        defaultValue={state?.values?.[name]}
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

export function PropertyForm() {
  const [state, formAction, pending] = useActionState(addProperty, undefined)
  const [thumbnail, setThumbnail] = useState<string[]>([])
  const [gallery, setGallery] = useState<string[]>([])

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="thumbnailUrl" value={thumbnail[0] ?? ''} />
      <input type="hidden" name="galleryUrls" value={JSON.stringify(gallery)} />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Property address</legend>
        <Field label="Street address" name="line1" state={state} placeholder="123 Main St" />
        <Field label="Apartment, suite, etc." name="line2" state={state} required={false} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" name="city" state={state} />
          <Field label="State / region" name="state" state={state} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Postal code" name="postalCode" state={state} />
          <Field label="Country" name="country" state={state} placeholder="United States" />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Details</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Rooms" name="bedrooms" state={state} type="number" inputMode="numeric" placeholder="3" />
          <Field label="Bathrooms" name="bathrooms" state={state} type="number" step="0.5" inputMode="decimal" placeholder="2" />
          <Field label="Square footage" name="squareFeet" state={state} type="number" inputMode="numeric" placeholder="1500" />
          <Field label="Land / lot size" name="lotSize" state={state} placeholder="0.25 acres" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Latitude" name="lat" state={state} required={false} inputMode="decimal" placeholder="41.6005" />
          <Field label="Longitude" name="lng" state={state} required={false} inputMode="decimal" placeholder="-95.1394" />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Valuation</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Current assessed value (USD)" name="assessedValue" state={state} type="number" inputMode="numeric" placeholder="120000" />
          <Field label="Asking purchase price (USD)" name="askingPrice" state={state} type="number" inputMode="numeric" placeholder="95000" />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Photos</legend>
        <ImageUploader label="Thumbnail (shown in listings)" value={thumbnail} onChange={setThumbnail} />
        <ImageUploader label="Gallery (shown when tenants browse)" multiple value={gallery} onChange={setGallery} />
      </fieldset>

      {state?.message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending} className="disabled:opacity-60">
          {pending ? 'Submitting…' : 'Submit for review'}
        </Button>
        <p className="text-sm text-olive-600 dark:text-olive-500">Saved as pending until an admin approves it.</p>
      </div>
    </form>
  )
}
