'use client'

import { useState } from 'react'
import { inputClass } from '@/components/elements/input'
import { SoftButton } from '@/components/elements/button'
import { withProcessingFee } from '@/lib/fees'
import { formatCents } from '@/lib/format'
import { PROGRAMS, pct, splitForIncome, type ProgramId } from '@/lib/programs'
import type { BillingFrequency } from '@/lib/tenants'

const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white'

/**
 * Per-draft amount inputs for a tenant's program, shared by every rent form
 * (start, adjust, restart). Posts `rentAmount` and/or `carAmount` in dollars;
 * the server re-validates them against the tenant's program
 * (lib/programs.ts parseProgramAmounts), so these fields are a convenience,
 * not a security boundary.
 *
 * "Suggest from income" fills the fields with the program's rates converted to
 * the chosen draft frequency (monthly income → weekly/biweekly/monthly).
 */
export function ProgramAmountFields({
  program,
  frequency,
  monthlyIncome,
  initial,
  autoSuggest = false,
}: {
  program: ProgramId
  /** Draft frequency currently selected in the parent form ('' = not chosen yet). */
  frequency: BillingFrequency | ''
  /** Verified monthly income, when known — enables the suggestion. */
  monthlyIncome?: number
  initial?: { rent: number; car: number }
  /** Start form: refill the suggestion whenever the frequency changes, until the admin edits a field. */
  autoSuggest?: boolean
}) {
  const def = PROGRAMS[program]
  const [rent, setRent] = useState(initial ? initial.rent.toFixed(2) : '')
  const [car, setCar] = useState(initial ? initial.car.toFixed(2) : '')
  const [edited, setEdited] = useState(false)
  const [lastFrequency, setLastFrequency] = useState<BillingFrequency | ''>('')

  const suggestion = monthlyIncome && frequency ? splitForIncome(program, monthlyIncome, frequency) : null

  // Adjust state during render when the frequency changes (React's recommended
  // alternative to an effect for derived resets).
  if (autoSuggest && !edited && frequency !== lastFrequency) {
    setLastFrequency(frequency)
    if (suggestion) {
      setRent(suggestion.rent.toFixed(2))
      setCar(suggestion.car.toFixed(2))
    }
  }

  const rentCents = def.rentRate > 0 ? Math.round(Number(rent) * 100) : 0
  const carCents = def.carRate > 0 ? Math.round(Number(car) * 100) : 0
  const base = rentCents + carCents
  const preview = Number.isFinite(base) && base > 0 ? formatCents(withProcessingFee(base)) : '—'

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-2">
        {def.rentRate > 0 && (
          <label className={labelClass}>
            Rent per draft (USD, {pct(def.rentRate)}% of pay)
            <input
              name="rentAmount"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={rent}
              onChange={(e) => {
                setEdited(true)
                setRent(e.target.value)
              }}
              className={inputClass}
            />
          </label>
        )}
        {def.carRate > 0 && (
          <label className={labelClass}>
            Car program per draft (USD, {pct(def.carRate)}% of pay)
            <input
              name="carAmount"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={car}
              onChange={(e) => {
                setEdited(true)
                setCar(e.target.value)
              }}
              className={inputClass}
            />
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-olive-600 dark:text-olive-500">
        <span>
          Charged per draft: <strong className="text-olive-950 dark:text-white">{preview}</strong> (base + Stripe
          processing, which the tenant covers).
        </span>
        {suggestion && (
          <SoftButton
            type="button"
            onClick={() => {
              setRent(suggestion.rent.toFixed(2))
              setCar(suggestion.car.toFixed(2))
            }}
          >
            Suggest from verified income
          </SoftButton>
        )}
      </div>
    </div>
  )
}
