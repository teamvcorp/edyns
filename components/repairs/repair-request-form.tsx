'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/elements/button'
import { inputClass } from '@/components/elements/input'
import { submitRepairRequest, type RepairFormState } from '@/app/actions/repairs'

const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white'

// Mirrors lib/repairs.ts (that module is server-only, so the client keeps its own copy for UX checks;
// the server re-validates everything).
const MAX_PHOTOS = 3
const MAX_PHOTO_BYTES = 4 * 1024 * 1024

const categories = [
  ['plumbing', 'Plumbing'],
  ['electrical', 'Electrical'],
  ['heating_cooling', 'Heating / cooling'],
  ['appliance', 'Appliance'],
  ['roof_exterior', 'Roof / exterior'],
  ['pest', 'Pests'],
  ['other', 'Other'],
] as const

/**
 * Repair request form for partners and tenants. `properties` is the list the
 * server says this user may use — the action re-checks it, so editing the
 * <select> in devtools gets nowhere.
 */
export function RepairRequestForm({ properties }: { properties: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<RepairFormState, FormData>(submitRepairRequest, undefined)
  const [urgency, setUrgency] = useState('routine')
  const [photoError, setPhotoError] = useState<string | null>(null)
  // Remount (clear) the form after each successful submit.
  const [formKey, setFormKey] = useState(0)
  const [lastOk, setLastOk] = useState<RepairFormState>(undefined)
  if (state?.ok && state !== lastOk) {
    setLastOk(state)
    setFormKey((k) => k + 1)
    setUrgency('routine')
  }

  function checkPhotos(files: FileList | null) {
    if (!files) return setPhotoError(null)
    const total = Array.from(files).reduce((sum, f) => sum + f.size, 0)
    if (files.length > MAX_PHOTOS) setPhotoError(`Attach at most ${MAX_PHOTOS} photos.`)
    else if (total > MAX_PHOTO_BYTES) setPhotoError('Photos are over 4 MB in total — please choose smaller ones.')
    else setPhotoError(null)
  }

  return (
    <form key={formKey} action={action} className="flex flex-col gap-4">
      <label className={labelClass}>
        Property
        <select name="propertyId" required defaultValue={properties.length === 1 ? properties[0].id : ''} className={inputClass}>
          {properties.length > 1 && (
            <option value="" disabled>
              Choose a property…
            </option>
          )}
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Category
          <select name="category" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Choose…
            </option>
            {categories.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Urgency
          <select name="urgency" value={urgency} onChange={(e) => setUrgency(e.target.value)} className={inputClass}>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent (needs attention this week)</option>
            <option value="emergency">Emergency (unsafe or causing damage now)</option>
          </select>
        </label>
      </div>

      {urgency === 'emergency' && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 ring-1 ring-red-500/30 dark:text-red-400">
          If anyone is in danger — gas smell, fire, sparking, or flooding — call 911 or your utility company first, then
          submit this request.
        </p>
      )}

      <label className={labelClass}>
        Short summary
        <input name="title" required maxLength={120} placeholder="e.g. Kitchen sink leaking under cabinet" className={inputClass} />
      </label>

      <label className={labelClass}>
        What’s happening?
        <textarea
          name="description"
          required
          maxLength={2000}
          rows={5}
          placeholder="Where is it, when did it start, and is it getting worse?"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Photos (optional)
        <input
          type="file"
          name="photos"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => checkPhotos(e.target.files)}
          className="text-base text-olive-700 sm:text-sm dark:text-olive-300"
        />
        <span className="text-xs font-normal text-olive-600 dark:text-olive-500">
          Up to 3 JPEG, PNG or WebP photos, 4 MB total. Stored privately — only you, our team, and the property owner can
          see them.
        </span>
      </label>

      {(photoError || state?.error) && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {photoError ?? state?.error}
        </p>
      )}
      {state?.ok && !pending && (
        <p role="status" className="text-sm text-olive-700 dark:text-olive-300">
          Request sent — our team has been notified. You’ll get an email when its status changes.
        </p>
      )}

      <Button type="submit" disabled={pending || Boolean(photoError)} className="w-fit disabled:opacity-60">
        {pending ? 'Sending…' : 'Send repair request'}
      </Button>
    </form>
  )
}
