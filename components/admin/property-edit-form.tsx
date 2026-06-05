'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/elements/button'
import { ImageUploader } from '@/components/partners/image-uploader'
import { updatePropertyAction, type PropertyEditState } from '@/app/actions/admin'
import { TIERS } from '@/lib/tiers'
import type { Property } from '@/lib/properties'

const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10'

function Field({
  label,
  name,
  state,
  initial,
  type = 'text',
  required = true,
  step,
  className,
}: {
  label: string
  name: string
  state: PropertyEditState
  initial?: string | number
  type?: string
  required?: boolean
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
        required={required}
        step={step}
        defaultValue={state?.values?.[name] ?? (initial ?? '')}
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

export function PropertyEditForm({ property }: { property: Property }) {
  const [state, formAction, pending] = useActionState(updatePropertyAction, undefined)
  const [thumbnail, setThumbnail] = useState<string[]>(property.thumbnailUrl ? [property.thumbnailUrl] : [])
  const [gallery, setGallery] = useState<string[]>(property.galleryUrls)
  const a = property.address

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="id" value={property.id} />
      <input type="hidden" name="thumbnailUrl" value={thumbnail[0] ?? ''} />
      <input type="hidden" name="galleryUrls" value={JSON.stringify(gallery)} />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Status & equity</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
            Status
            <select name="status" defaultValue={state?.values?.status ?? property.status} className={inputClass}>
              <option value="pending">Pending review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            {state?.errors?.status && (
              <span role="alert" className="text-xs font-normal text-red-600 dark:text-red-400">
                {state.errors.status}
              </span>
            )}
          </label>
          <Field
            label="Equity generated (USD)"
            name="equityGenerated"
            type="number"
            state={state}
            initial={property.equityGenerated}
            required={false}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
            Housing tier
            <select name="tier" defaultValue={state?.values?.tier ?? property.tier ?? ''} className={inputClass}>
              <option value="">Select tier…</option>
              {TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.value} · {t.label}
                </option>
              ))}
            </select>
            {state?.errors?.tier && (
              <span role="alert" className="text-xs font-normal text-red-600 dark:text-red-400">
                {state.errors.tier}
              </span>
            )}
          </label>
          <Field
            label="Income requirement (USD/mo)"
            name="incomeRequirement"
            type="number"
            state={state}
            initial={property.incomeRequirement}
            required={false}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Property address</legend>
        <Field label="Street address" name="line1" state={state} initial={a.line1} />
        <Field label="Apartment, suite, etc." name="line2" state={state} initial={a.line2} required={false} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" name="city" state={state} initial={a.city} />
          <Field label="State / region" name="state" state={state} initial={a.state} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Postal code" name="postalCode" state={state} initial={a.postalCode} />
          <Field label="Country" name="country" state={state} initial={a.country} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Details</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Rooms" name="bedrooms" type="number" state={state} initial={property.bedrooms} />
          <Field label="Bathrooms" name="bathrooms" type="number" step="0.5" state={state} initial={property.bathrooms} />
          <Field label="Square footage" name="squareFeet" type="number" state={state} initial={property.squareFeet} />
          <Field label="Land / lot size" name="lotSize" state={state} initial={property.lotSize} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Latitude" name="lat" state={state} initial={property.coordinates?.lat} required={false} />
          <Field label="Longitude" name="lng" state={state} initial={property.coordinates?.lng} required={false} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Valuation</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Current assessed value (USD)" name="assessedValue" type="number" state={state} initial={property.assessedValue} />
          <Field label="Asking purchase price (USD)" name="askingPrice" type="number" state={state} initial={property.askingPrice} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Photos</legend>
        <ImageUploader label="Thumbnail" value={thumbnail} onChange={setThumbnail} />
        <ImageUploader label="Gallery" multiple value={gallery} onChange={setGallery} />
      </fieldset>

      {state?.message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
      {state?.ok && <p className="text-sm text-olive-700 dark:text-olive-300">Saved.</p>}

      <Button type="submit" size="lg" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  )
}
