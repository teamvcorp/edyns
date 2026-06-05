'use server'

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import { createUser, isEmailTaken, registerPartner } from '@/lib/users'
import { createTenantApplication, type Person } from '@/lib/tenants'
import { applicationTotalCents } from '@/lib/stripe'
import { sendCredentialsEmail } from '@/lib/email'
import type { TenantEnrollState } from '@/app/actions/tenants'
import type { EnrollState } from '@/app/actions/partners'

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function num(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parsePeople(json: string): Person[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((p) => p && typeof p.name === 'string' && typeof p.dob === 'string')
      .map((p) => ({ name: String(p.name).trim(), dob: String(p.dob).trim() }))
      .filter((p) => p.name && p.dob)
  } catch {
    return []
  }
}

/** Admin creates a tenant from a paper application; temp password is emailed. */
export async function createTenantByAdmin(_prev: TenantEnrollState, formData: FormData): Promise<TenantEnrollState> {
  await requireRole('admin', '/admin/login')
  const get = (k: string) => String(formData.get(k) ?? '').trim()

  const fields = [
    'name', 'email', 'phone', 'dob',
    'line1', 'line2', 'city', 'state', 'postalCode', 'country',
    'employer', 'jobTitle', 'monthlyIncome', 'employerPhone', 'adults', 'children',
  ]
  const values: Record<string, string> = {}
  for (const f of fields) values[f] = get(f)
  const password = String(formData.get('password') ?? '')

  const errors: Record<string, string> = {}
  if (!values.name) errors.name = 'Enter the head of household’s name.'
  if (!values.email) errors.email = 'Enter an email.'
  else if (!emailRe.test(values.email)) errors.email = 'Enter a valid email.'
  if (!values.phone) errors.phone = 'Enter a phone number.'
  if (!values.dob) errors.dob = 'Enter the date of birth.'
  if (password.length < 8) errors.password = 'Temp password must be at least 8 characters.'
  if (!values.line1) errors.line1 = 'Enter the street address.'
  if (!values.city) errors.city = 'Enter the city.'
  if (!values.state) errors.state = 'Enter the state/region.'
  if (!values.postalCode) errors.postalCode = 'Enter the postal code.'
  if (!values.country) errors.country = 'Enter the country.'
  if (!values.employer) errors.employer = 'Enter the employer.'
  if (!values.jobTitle) errors.jobTitle = 'Enter the job title.'
  const monthlyIncome = num(values.monthlyIncome)
  if (monthlyIncome === null || monthlyIncome < 0) errors.monthlyIncome = 'Enter the monthly income.'

  if (Object.keys(errors).length > 0) return { errors, values }
  if (await isEmailTaken(values.email, 'tenant')) {
    return { errors: { email: 'A tenant with this email already exists.' }, values }
  }

  const user = await createUser({ email: values.email, name: values.name, password, role: 'tenant' })
  await createTenantApplication(user.id, {
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
    feeAmountCents: applicationTotalCents(),
  })

  let emailed = true
  try {
    await sendCredentialsEmail({ to: values.email, name: values.name, tempPassword: password, role: 'tenant' })
  } catch {
    emailed = false
  }

  redirect(`/admin/tenants?created=1${emailed ? '' : '&email=failed'}`)
}

/** Admin creates a property partner from a paper application; temp password is emailed. No fee. */
export async function createPartnerByAdmin(_prev: EnrollState, formData: FormData): Promise<EnrollState> {
  await requireRole('admin', '/admin/login')
  const get = (k: string) => String(formData.get(k) ?? '').trim()

  const echo = ['name', 'email', 'phone', 'line1', 'line2', 'city', 'state', 'postalCode', 'country', 'taxId']
  const values: Record<string, string> = {}
  for (const f of echo) values[f] = get(f)
  const password = String(formData.get('password') ?? '')

  const errors: Record<string, string> = {}
  if (!values.name) errors.name = 'Enter the partner’s full name.'
  if (!values.email) errors.email = 'Enter an email address.'
  else if (!emailRe.test(values.email)) errors.email = 'Enter a valid email address.'
  if (!values.phone) errors.phone = 'Enter a phone number.'
  if (password.length < 8) errors.password = 'Temp password must be at least 8 characters.'
  if (!values.line1) errors.line1 = 'Enter the street address.'
  if (!values.city) errors.city = 'Enter the city.'
  if (!values.state) errors.state = 'Enter the state/region.'
  if (!values.postalCode) errors.postalCode = 'Enter the postal code.'
  if (!values.country) errors.country = 'Enter the country.'
  if (!values.taxId) errors.taxId = 'Enter the tax ID (EIN or SSN).'

  if (Object.keys(errors).length > 0) return { errors, values }
  if (await isEmailTaken(values.email, 'partner')) {
    return { errors: { email: 'A partner with this email already exists.' }, values }
  }

  await registerPartner({
    name: values.name,
    email: values.email,
    phone: values.phone,
    password,
    billingAddress: {
      line1: values.line1,
      line2: values.line2 || undefined,
      city: values.city,
      state: values.state,
      postalCode: values.postalCode,
      country: values.country,
    },
    taxId: values.taxId,
  })

  let emailed = true
  try {
    await sendCredentialsEmail({ to: values.email, name: values.name, tempPassword: password, role: 'partner' })
  } catch {
    emailed = false
  }

  redirect(`/admin/partners?created=1${emailed ? '' : '&email=failed'}`)
}
