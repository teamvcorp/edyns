// Tenant programs — the single source of truth for what each program collects.
//
// Client-safe (no `server-only`, no secrets): used by server actions, the admin
// billing form preview, the enrollment form's live affordability warning and
// the tenant dashboard copy. NEVER hard-code "40%" (or any rate) elsewhere —
// read it from here so a rate change is a one-line edit.
//
// Business rules (decided 2026-11-14, see README "Business rules"):
//   effort_exchange  40% of pay → rent for a home we manage (partner property).
//   own_landlord     30% of pay → rent we forward to the tenant's own landlord
//                    + 10% of pay → car savings held by edynsgate.
//   car_only         10% of pay → car savings held by edynsgate.
// Every program requires the 35-hr/week effort commitment (REQUIRED_WEEKLY_HOURS).

import type { BillingFrequency } from './tenants' // type-only: erased at build, safe on the client

export const PROGRAM_IDS = ['effort_exchange', 'own_landlord', 'car_only'] as const
export type ProgramId = (typeof PROGRAM_IDS)[number]

/** Records created before programs existed have no `program` field → Effort Exchange. */
export const DEFAULT_PROGRAM: ProgramId = 'effort_exchange'

export interface ProgramDef {
  id: ProgramId
  /** Full public name. */
  label: string
  /** Short eyebrow-style name. */
  short: string
  /** Share of monthly pay collected as rent (0 when the program has no rent). */
  rentRate: number
  /** Share of monthly pay collected into car savings. */
  carRate: number
  /** True when the tenant lives in a home we manage (partner equity, repairs, move-ins apply). */
  managedHousing: boolean
  /** True when we forward rent to a landlord we don't represent (needs lease + landlord details). */
  outsideLandlord: boolean
  /** One-sentence public description for the program chooser. */
  summary: string
}

export const PROGRAMS: Record<ProgramId, ProgramDef> = {
  effort_exchange: {
    id: 'effort_exchange',
    label: 'The Effort Exchange',
    short: 'Effort Exchange',
    rentRate: 0.4,
    carRate: 0,
    managedHousing: true,
    outsideLandlord: false,
    summary: 'Live in a home in our network. 40% of your pay covers your rent and utilities.',
  },
  own_landlord: {
    id: 'own_landlord',
    label: 'Your Home + Car',
    short: 'Own landlord',
    rentRate: 0.3,
    carRate: 0.1,
    managedHousing: false,
    outsideLandlord: true,
    summary:
      'Stay where you rent now. We collect 30% of your pay and pay your landlord, plus 10% saved toward a car.',
  },
  car_only: {
    id: 'car_only',
    label: 'Car Savings',
    short: 'Car savings',
    rentRate: 0,
    carRate: 0.1,
    managedHousing: false,
    outsideLandlord: false,
    summary: 'We collect 10% of your pay and hold it toward a car. When you have enough, we help you get one.',
  },
}

export function isProgramId(v: unknown): v is ProgramId {
  return typeof v === 'string' && (PROGRAM_IDS as readonly string[]).includes(v)
}

/** The tenant's program, defaulting legacy records to the Effort Exchange. */
export function programOf(t: { program?: ProgramId | null } | null | undefined): ProgramId {
  return t?.program && isProgramId(t.program) ? t.program : DEFAULT_PROGRAM
}

/** Whole-number percent for display, e.g. 0.3 → 30. */
export function pct(rate: number): number {
  return Math.round(rate * 100)
}

/** "30% rent + 10% car", "40% rent", "10% car" — human summary of what's collected. */
export function rateSummary(program: ProgramId): string {
  const { rentRate, carRate } = PROGRAMS[program]
  const parts: string[] = []
  if (rentRate > 0) parts.push(`${pct(rentRate)}% rent`)
  if (carRate > 0) parts.push(`${pct(carRate)}% car savings`)
  return parts.join(' + ')
}

// ---- Money math ---------------------------------------------------------------

/**
 * Housing is "affordable" when rent is at most 30% of monthly income. Used for
 * the enrollment warning, the shortfall email and the affordable-homes list.
 */
export const AFFORDABLE_RENT_RATE = 0.3

const DRAFTS_PER_YEAR: Record<BillingFrequency, number> = { weekly: 52, biweekly: 26, monthly: 12 }

/** Convert a monthly dollar amount to the per-draft amount for a frequency (rounded to cents). */
export function perDraftFromMonthly(monthlyDollars: number, frequency: BillingFrequency): number {
  return Math.round(((monthlyDollars * 12) / DRAFTS_PER_YEAR[frequency]) * 100) / 100
}

/**
 * Suggested per-draft collection for a program, in dollars, split into its rent
 * and car parts. Admins can still edit the figures before starting collection.
 *
 * Teaching note: income is stored monthly, but drafts can be weekly/biweekly.
 * Before programs existed the monthly 40% was pre-filled for every frequency,
 * which over-collected ~4x on weekly drafts — this conversion fixes that.
 */
export function splitForIncome(
  program: ProgramId,
  monthlyIncome: number,
  frequency: BillingFrequency,
): { rent: number; car: number } {
  const { rentRate, carRate } = PROGRAMS[program]
  return {
    rent: perDraftFromMonthly(monthlyIncome * rentRate, frequency),
    car: perDraftFromMonthly(monthlyIncome * carRate, frequency),
  }
}

/** Per-draft cap per component — a typo guard (cents typed as dollars), not a policy limit. */
export const MAX_DRAFT_COMPONENT_DOLLARS = 20_000

export type ProgramAmounts = {
  rentCents: number
  carCents: number
  /** rent + car — what gets grossed up with withProcessingFee. */
  baseAmountCents: number
  /** Stored on billing + Stripe price metadata; omitted for rent-only (Effort Exchange). */
  split?: { rentCents: number; carCents: number }
}

/**
 * Read the admin-entered per-draft amounts (`rentAmount`, `carAmount`, dollars)
 * for a program. Server-side gate for every rent form (start / adjust / restart):
 * a component the program doesn't have must be empty/zero, one it has must be > 0.
 */
export function parseProgramAmounts(
  fd: FormData,
  program: ProgramId,
): { ok: true; amounts: ProgramAmounts } | { ok: false; error: string } {
  const def = PROGRAMS[program]
  const read = (k: string): number | null => {
    const s = String(fd.get(k) ?? '').trim()
    if (s === '') return 0
    const n = Number(s)
    return Number.isFinite(n) && n >= 0 && n <= MAX_DRAFT_COMPONENT_DOLLARS ? n : null
  }
  const rent = read('rentAmount')
  const car = read('carAmount')
  if (rent === null || car === null) return { ok: false, error: 'Enter amounts in dollars (up to $20,000 each).' }
  if (def.rentRate > 0 && rent <= 0) return { ok: false, error: `Enter the rent amount (${pct(def.rentRate)}% of pay).` }
  if (def.rentRate === 0 && rent > 0) return { ok: false, error: `${def.label} has no rent component.` }
  if (def.carRate > 0 && car <= 0) return { ok: false, error: `Enter the car savings amount (${pct(def.carRate)}% of pay).` }
  if (def.carRate === 0 && car > 0) return { ok: false, error: `${def.label} has no car savings component.` }

  const rentCents = Math.round(rent * 100)
  const carCents = Math.round(car * 100)
  return {
    ok: true,
    amounts: {
      rentCents,
      carCents,
      baseAmountCents: rentCents + carCents,
      split: def.carRate > 0 ? { rentCents, carCents } : undefined,
    },
  }
}

/** Max monthly rent that counts as affordable for an income (dollars). */
export function affordableRentFor(monthlyIncome: number): number {
  return Math.floor(monthlyIncome * AFFORDABLE_RENT_RATE * 100) / 100
}

/** True when the stated rent is above 30% of monthly income (both in dollars). */
export function rentExceedsAffordable(monthlyRent: number, monthlyIncome: number): boolean {
  return monthlyIncome > 0 && monthlyRent > affordableRentFor(monthlyIncome)
}
