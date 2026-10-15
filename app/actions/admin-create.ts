'use server'

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import { createUser, isEmailTaken, registerPartner, findPartnerById } from '@/lib/users'
import { createPropertyAsAdmin } from '@/lib/properties'
import { parsePropertyForm } from '@/lib/property-input'
import { revalidatePath } from 'next/cache'
import {
  createTenantApplication,
  attachStripeCustomer,
  getTenantByStripeCustomer,
  markFeeCollectedOffline,
  type Person,
} from '@/lib/tenants'
import { applicationTotalCents, fetchCustomerForImport, type ImportedCustomer } from '@/lib/stripe'
import { sendCredentialsEmail } from '@/lib/email'
import type { TenantEnrollState } from '@/app/actions/tenants'
import type { EnrollState } from '@/app/actions/partners'
import type { PropertyEditState } from '@/app/actions/admin'

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

// ---- Prefill from an existing Stripe customer ----

export type CustomerLookupState =
  | { customerId: string; values: Record<string, string>; paymentMethodLabel: string | null }
  | { error: string }
  | undefined

/**
 * Look up a Stripe customer so the add-tenant form can be prefilled with their
 * demographics (name, email, phone, address) and show the saved payment method.
 * Read-only — nothing is linked until the application is actually created.
 */
export async function lookupStripeCustomerAction(
  _prev: CustomerLookupState,
  formData: FormData,
): Promise<CustomerLookupState> {
  await requireRole('admin', '/admin/login')
  const customerId = String(formData.get('customerId') ?? '').trim()
  if (!customerId) return { error: 'Paste the Stripe customer id.' }

  const result = await fetchCustomerForImport(customerId)
  if (!result.ok) return { error: result.error }

  const existing = await getTenantByStripeCustomer(result.data.customerId)
  if (existing) return { error: `That Stripe customer is already linked to ${existing.name}.` }

  const c = result.data
  const values: Record<string, string> = {
    name: c.name ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    line1: c.address?.line1 ?? '',
    line2: c.address?.line2 ?? '',
    city: c.address?.city ?? '',
    state: c.address?.state ?? '',
    postalCode: c.address?.postalCode ?? '',
    // Stripe stores ISO codes; expand the common one for the free-text field.
    country: c.address?.country === 'US' ? 'United States' : c.address?.country ?? '',
  }
  return { customerId: c.customerId, values, paymentMethodLabel: c.paymentMethodLabel }
}

/** Admin creates a tenant from a paper application; temp password is emailed.
 *  Optionally linked to an existing Stripe customer (re-verified server-side),
 *  importing their saved payment method so rent can draft without the in-app
 *  fee checkout. */
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

  // Linking an existing Stripe customer: the posted id is untrusted, so
  // re-fetch it from Stripe and re-check it isn't linked to another tenant.
  const stripeCustomerId = get('stripeCustomerId')
  let imported: ImportedCustomer | null = null
  if (stripeCustomerId) {
    const result = await fetchCustomerForImport(stripeCustomerId)
    if (!result.ok) return { message: result.error, values }
    if (await getTenantByStripeCustomer(result.data.customerId)) {
      return { message: 'That Stripe customer is already linked to another tenant.', values }
    }
    imported = result.data
  }

  const user = await createUser({ email: values.email, name: values.name, password, role: 'tenant' })
  const tenant = await createTenantApplication(user.id, {
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

  if (imported) {
    await attachStripeCustomer(user.id, imported.customerId, imported.defaultPaymentMethodId ?? undefined)
  }
  // Admin attests the $25 fee was collected outside the app (cash / Stripe-side).
  if (formData.get('feeCollected') === 'on') {
    await markFeeCollectedOffline(tenant.id)
  }

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

/**
 * Admin takes in a new property on a partner's behalf (e.g. an acquisition or a
 * paper submission). Same validation as every other property form
 * (lib/property-input.ts). Because an admin is entering it, they may set status,
 * tier and equity up front — an "approved" property must be fully priced.
 */
export async function createPropertyByAdmin(
  _prev: PropertyEditState,
  formData: FormData,
): Promise<PropertyEditState> {
  await requireRole('admin', '/admin/login')

  const parsed = parsePropertyForm(formData, { admin: true })
  const partnerId = String(formData.get('partnerId') ?? '').trim()

  const errors: Record<string, string> = parsed.ok ? {} : { ...parsed.errors }
  const values = { ...parsed.values, partnerId }

  // The owner must be a real partner account (never trust the posted id).
  if (!partnerId) errors.partnerId = 'Choose the partner who owns this property.'
  else if (!(await findPartnerById(partnerId))) errors.partnerId = 'Choose an existing partner.'

  if (!parsed.ok || Object.keys(errors).length > 0) return { errors, values }

  const property = await createPropertyAsAdmin(partnerId, {
    ...parsed.input,
    status: parsed.admin!.status,
    equityGenerated: parsed.admin!.equityGenerated,
    equitySharePercent: parsed.admin!.equitySharePercent,
  })

  revalidatePath('/admin/properties')
  revalidatePath('/properties')
  revalidatePath('/partners/properties')
  revalidatePath('/partners')
  redirect(`/admin/properties/${property.id}?created=1`) // throws NEXT_REDIRECT
}
