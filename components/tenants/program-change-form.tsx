'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/elements/button'
import { inputClass } from '@/components/elements/input'
import { requestProgramChangeAction, type ProgramChangeState } from '@/app/actions/program-change'
import { PROGRAMS, PROGRAM_IDS, rateSummary, isProgramId, type ProgramId } from '@/lib/programs'

const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white'

/**
 * Tenant asks to move to another program. Outside-landlord programs also need
 * the landlord, rent and lease (validated server-side with the same rules as
 * enrollment — lib/tenant-input.ts parseLandlordFields). An admin approves.
 */
export function ProgramChangeForm({ current }: { current: ProgramId }) {
  const [state, action, pending] = useActionState<ProgramChangeState, FormData>(requestProgramChangeAction, undefined)
  const options = PROGRAM_IDS.filter((id) => id !== current)
  const [to, setTo] = useState<ProgramId>(options[0])
  const needsLandlord = PROGRAMS[to].outsideLandlord
  const err = (k: string) =>
    state?.errors?.[k] ? (
      <span role="alert" className="text-xs font-normal text-red-600 dark:text-red-400">
        {state.errors[k]}
      </span>
    ) : null

  if (state?.ok) {
    return (
      <p role="status" className="text-sm text-olive-700 dark:text-olive-300">
        {state.ok}
      </p>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className={labelClass}>
        New program
        <select
          name="program"
          value={to}
          onChange={(e) => isProgramId(e.target.value) && setTo(e.target.value)}
          className={inputClass}
        >
          {options.map((id) => (
            <option key={id} value={id}>
              {PROGRAMS[id].label} — {rateSummary(id)}
            </option>
          ))}
        </select>
        <span className="text-xs font-normal text-olive-600 dark:text-olive-500">{PROGRAMS[to].summary}</span>
      </label>

      {needsLandlord && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-semibold text-olive-700 dark:text-olive-400">Your landlord & lease</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Landlord or property manager
              <input name="landlordName" required className={inputClass} />
              {err('landlordName')}
            </label>
            <label className={labelClass}>
              Landlord phone
              <input name="landlordPhone" type="tel" required className={inputClass} />
              {err('landlordPhone')}
            </label>
            <label className={labelClass}>
              Landlord email (optional)
              <input name="landlordEmail" type="email" className={inputClass} />
              {err('landlordEmail')}
            </label>
            <label className={labelClass}>
              Monthly rent (USD)
              <input name="monthlyRent" type="number" inputMode="decimal" step="0.01" min="1" required className={inputClass} />
              {err('monthlyRent')}
            </label>
          </div>
          <label className={labelClass}>
            Where your landlord receives rent (optional)
            <input name="landlordPaymentAddress" className={inputClass} />
          </label>
          <label className={labelClass}>
            Lease (PDF or photo, up to 4 MB)
            <input
              type="file"
              name="lease"
              required
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="text-sm text-olive-700 file:mr-3 file:rounded-full file:border-0 file:bg-olive-950/5 file:px-4 file:py-2 file:text-sm file:font-medium file:text-olive-950 dark:text-olive-400 dark:file:bg-white/10 dark:file:text-white"
            />
            {err('lease')}
          </label>
        </fieldset>
      )}

      <label className={labelClass}>
        Anything we should know? (optional)
        <input name="note" maxLength={500} className={inputClass} />
      </label>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-fit disabled:opacity-60">
        {pending ? 'Sending…' : 'Request this change'}
      </Button>
      <p className="text-xs text-olive-600 dark:text-olive-500">
        Our team reviews every change. If you pay on a fixed schedule, your draft amount updates to the new program’s rate
        from your next draft after approval.
      </p>
    </form>
  )
}
