import 'server-only'

import type { Address } from './users'
import type { Employment, Landlord, Person } from './tenants'
import { isProgramId, DEFAULT_PROGRAM, PROGRAMS, type ProgramId } from './programs'
import { checkUpload, type CheckedUpload } from './files'
import { MAX_LEASE_BYTES } from './leases'
import { logWarn } from './log'

/**
 * Shared parsing + validation for every tenant application form: public
 * self-enrollment (app/actions/tenants.ts enrollTenant) and admin paper entry
 * (app/actions/admin-create.ts createTenantByAdmin). Before this existed the
 * two actions carried near-identical copies (CODEMAP D4–D9); keep ALL tenant
 * form rules here so the paths can't drift.
 *
 * Security: everything from FormData is untrusted. The program id is checked
 * against the known list, money is parsed as finite non-negative numbers, and
 * the lease is validated by its bytes (checkUpload) before anything is stored.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isEmail(v: string): boolean {
  return EMAIL_RE.test(v)
}

/** Trimmed string field from a form ('' when missing). */
export function formStr(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim()
}

/** Parse a decimal string; null when blank or not a finite number. */
export function num(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Household members arrive as a JSON array of {name, dob}; malformed entries are dropped. */
export function parsePeople(json: string): Person[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((p) => p && typeof p.name === 'string' && typeof p.dob === 'string')
      .map((p) => ({ name: String(p.name).trim(), dob: String(p.dob).trim() }))
      .filter((p) => p.name && p.dob)
  } catch {
    logWarn('tenant-input', 'malformed people JSON')
    return []
  }
}

const BASE_FIELDS = [
  'name', 'email', 'phone', 'dob',
  'line1', 'line2', 'city', 'state', 'postalCode', 'country',
  'employer', 'jobTitle', 'monthlyIncome', 'employerPhone',
  'adults', 'children', 'program',
] as const

const LANDLORD_FIELDS = ['landlordName', 'landlordPhone', 'landlordEmail', 'landlordPaymentAddress', 'monthlyRent'] as const

export type ParsedTenantForm = {
  /** Echoed back to the form after a validation error (never includes the password). */
  values: Record<string, string>
  errors: Record<string, string>
  password: string
  program: ProgramId
  /** Present only when there are no errors. */
  input?: {
    name: string
    email: string
    phone: string
    dob: string
    address: Address
    adults: Person[]
    children: Person[]
    employment: Employment
    program: ProgramId
    landlord?: Landlord
  }
  /** Outside-landlord programs: the validated lease bytes, ready for saveLeaseFile(). */
  lease?: Extract<CheckedUpload, { ok: true }>
}

const LEASE_ERRORS: Record<'missing' | 'too-big' | 'bad-type', string> = {
  missing: 'Upload a copy of your lease.',
  'too-big': 'The lease file is too large (4 MB max). Try a smaller PDF or photo.',
  'bad-type': 'Upload the lease as a PDF, JPEG, PNG or WebP.',
}

/**
 * Validate a tenant application. `mode` only changes wording (admins enter a
 * temporary password). Invite overrides (name/email) are applied by the caller
 * BEFORE calling this, via `overrides`.
 */
export async function parseTenantForm(
  fd: FormData,
  opts: { mode: 'self' | 'admin'; overrides?: { name?: string; email?: string; program?: ProgramId } } = { mode: 'self' },
): Promise<ParsedTenantForm> {
  const values: Record<string, string> = {}
  for (const f of BASE_FIELDS) values[f] = formStr(fd, f)
  for (const f of LANDLORD_FIELDS) values[f] = formStr(fd, f)
  if (opts.overrides?.name) values.name = opts.overrides.name
  if (opts.overrides?.email) values.email = opts.overrides.email

  // Program: server decides. Unknown/missing → Effort Exchange; invites force it.
  const program: ProgramId = opts.overrides?.program ?? (isProgramId(values.program) ? values.program : DEFAULT_PROGRAM)
  values.program = program
  const password = String(fd.get('password') ?? '')

  const errors: Record<string, string> = {}
  if (!values.name) errors.name = 'Enter the head of household’s name.'
  if (!values.email) errors.email = 'Enter an email.'
  else if (!isEmail(values.email)) errors.email = 'Enter a valid email.'
  if (!values.phone) errors.phone = 'Enter a phone number.'
  if (!values.dob) errors.dob = 'Enter the date of birth.'
  if (password.length < 8) {
    errors.password = opts.mode === 'admin'
      ? 'Temp password must be at least 8 characters.'
      : 'Password must be at least 8 characters.'
  }
  if (!values.line1) errors.line1 = 'Enter the street address.'
  if (!values.city) errors.city = 'Enter the city.'
  if (!values.state) errors.state = 'Enter the state/region.'
  if (!values.postalCode) errors.postalCode = 'Enter the postal code.'
  if (!values.country) errors.country = 'Enter the country.'
  if (!values.employer) errors.employer = 'Enter the employer.'
  if (!values.jobTitle) errors.jobTitle = 'Enter the job title.'
  const monthlyIncome = num(values.monthlyIncome)
  if (monthlyIncome === null || monthlyIncome < 0) errors.monthlyIncome = 'Enter the monthly income.'

  // Outside-landlord programs: who we pay, how much, and the lease as evidence.
  let landlord: Landlord | undefined
  let lease: ParsedTenantForm['lease']
  if (PROGRAMS[program].outsideLandlord) {
    if (!values.landlordName) errors.landlordName = 'Enter your landlord’s or property manager’s name.'
    if (!values.landlordPhone) errors.landlordPhone = 'Enter your landlord’s phone number.'
    if (values.landlordEmail && !isEmail(values.landlordEmail)) errors.landlordEmail = 'Enter a valid email.'
    const rent = num(values.monthlyRent)
    // Upper bound is a typo guard (e.g. cents typed as dollars), not a policy limit.
    if (rent === null || rent <= 0 || rent > 100_000) errors.monthlyRent = 'Enter your monthly rent from the lease.'

    const file = fd.get('lease')
    const checked = await checkUpload(file instanceof File ? file : null, MAX_LEASE_BYTES)
    if (checked.ok) lease = checked
    else errors.lease = LEASE_ERRORS[checked.error]

    if (rent !== null && rent > 0) {
      landlord = {
        name: values.landlordName,
        phone: values.landlordPhone,
        email: values.landlordEmail || undefined,
        paymentAddress: values.landlordPaymentAddress || undefined,
        monthlyRentCents: Math.round(rent * 100),
      }
    }
  }

  if (Object.keys(errors).length > 0) return { values, errors, password, program }

  return {
    values,
    errors,
    password,
    program,
    lease,
    input: {
      name: values.name,
      email: values.email,
      phone: values.phone,
      dob: values.dob,
      address: {
        line1: values.line1,
        line2: values.line2 || undefined,
        city: values.city,
        state: values.state,
        postalCode: values.postalCode,
        country: values.country,
      },
      adults: parsePeople(values.adults),
      children: parsePeople(values.children),
      employment: {
        employer: values.employer,
        jobTitle: values.jobTitle,
        monthlyIncome: monthlyIncome!,
        employerPhone: values.employerPhone || undefined,
      },
      program,
      landlord,
    },
  }
}
