'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import {
  approveProperty,
  rejectProperty,
  updateProperty,
  adminDeleteProperty,
  listPropertiesByPartner,
  getPropertyById,
} from '@/lib/properties'
import { updatePartner, deletePartner, findPartnerById } from '@/lib/users'
import {
  approveTenant,
  rejectTenant,
  placeTenant,
  getTenantById,
  setBilling,
  setNextIncomeCheck,
  setEmploymentTypeById,
  resumeBilling,
  type BillingFrequency,
} from '@/lib/tenants'
import { getRequestById, setRequestStatus } from '@/lib/moveins'
import { getPayoutById, markPayoutPaid, markPayoutDeclined } from '@/lib/payouts'
import { getStripe, withProcessingFee } from '@/lib/stripe'
import { sendApprovalEmail } from '@/lib/email'
import { MIN_TIER, MAX_TIER } from '@/lib/tiers'

export type AdminActionState = { error?: string } | undefined

export async function approvePropertyAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireRole('admin', '/admin/login')

  const id = String(formData.get('id') ?? '')
  const equity = Number(String(formData.get('equityGenerated') ?? '').trim())
  const tier = Number(String(formData.get('tier') ?? '').trim())
  const incomeRequirement = Number(String(formData.get('incomeRequirement') ?? '').trim())

  if (!id) return { error: 'Missing property id.' }
  if (!Number.isFinite(equity) || equity < 0) {
    return { error: 'Enter the equity amount to generate for this partner.' }
  }
  if (!Number.isInteger(tier) || tier < MIN_TIER || tier > MAX_TIER) {
    return { error: 'Choose a housing tier.' }
  }
  if (!Number.isFinite(incomeRequirement) || incomeRequirement < 0) {
    return { error: 'Enter the monthly income requirement.' }
  }

  const ok = await approveProperty(id, { equityGenerated: equity, tier, incomeRequirement })
  if (!ok) return { error: 'Property not found.' }

  revalidatePath('/admin/properties')
  revalidatePath('/properties')
  return undefined
}

export async function rejectPropertyAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireRole('admin', '/admin/login')

  const id = String(formData.get('id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()

  if (!id) return { error: 'Missing property id.' }

  const ok = await rejectProperty(id, reason || 'No reason provided.')
  if (!ok) return { error: 'Property not found.' }

  revalidatePath('/admin/properties')
  return undefined
}

// ---- Partner account management ----

export type PartnerEditState =
  | { errors?: Record<string, string>; values?: Record<string, string>; message?: string; ok?: boolean }
  | undefined

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function updatePartnerAction(_prev: PartnerEditState, formData: FormData): Promise<PartnerEditState> {
  await requireRole('admin', '/admin/login')

  const get = (k: string) => String(formData.get(k) ?? '').trim()
  const id = get('id')
  const fields = ['name', 'email', 'phone', 'line1', 'line2', 'city', 'state', 'postalCode', 'country', 'taxId']
  const values: Record<string, string> = {}
  for (const f of fields) values[f] = get(f)

  const errors: Record<string, string> = {}
  if (!values.name) errors.name = 'Enter a name.'
  if (!values.email) errors.email = 'Enter an email.'
  else if (!emailRe.test(values.email)) errors.email = 'Enter a valid email.'
  if (!values.phone) errors.phone = 'Enter a phone number.'
  if (!values.line1) errors.line1 = 'Enter the street address.'
  if (!values.city) errors.city = 'Enter the city.'
  if (!values.state) errors.state = 'Enter the state/region.'
  if (!values.postalCode) errors.postalCode = 'Enter the postal code.'
  if (!values.country) errors.country = 'Enter the country.'

  if (Object.keys(errors).length > 0) return { errors, values }

  const res = await updatePartner(id, {
    name: values.name,
    email: values.email,
    phone: values.phone,
    billingAddress: {
      line1: values.line1,
      line2: values.line2 || undefined,
      city: values.city,
      state: values.state,
      postalCode: values.postalCode,
      country: values.country,
    },
    taxId: values.taxId || undefined,
  })

  if (!res.ok) return { message: res.error, values }

  revalidatePath('/admin/partners')
  revalidatePath(`/admin/partners/${id}`)
  return { ok: true, values }
}

export async function deletePartnerAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')

  // Guard: don't delete a partner who still has properties (equity at stake).
  const props = await listPropertiesByPartner(id)
  if (props.length > 0) {
    redirect(`/admin/partners/${id}?error=has-properties`)
  }

  await deletePartner(id)
  revalidatePath('/admin/partners')
  redirect('/admin/partners')
}

// ---- Admin property edit / delete ----

export type PropertyEditState =
  | { errors?: Record<string, string>; values?: Record<string, string>; message?: string; ok?: boolean }
  | undefined

function num(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function updatePropertyAction(_prev: PropertyEditState, formData: FormData): Promise<PropertyEditState> {
  await requireRole('admin', '/admin/login')

  const get = (k: string) => String(formData.get(k) ?? '').trim()
  const id = get('id')
  const fields = [
    'line1', 'line2', 'city', 'state', 'postalCode', 'country',
    'bedrooms', 'bathrooms', 'squareFeet', 'lotSize', 'lat', 'lng',
    'assessedValue', 'askingPrice', 'status', 'equityGenerated', 'tier', 'incomeRequirement',
    'thumbnailUrl', 'galleryUrls',
  ]
  const values: Record<string, string> = {}
  for (const f of fields) values[f] = get(f)

  const errors: Record<string, string> = {}
  if (!values.line1) errors.line1 = 'Enter the street address.'
  if (!values.city) errors.city = 'Enter the city.'
  if (!values.state) errors.state = 'Enter the state/region.'
  if (!values.postalCode) errors.postalCode = 'Enter the postal code.'
  if (!values.country) errors.country = 'Enter the country.'

  const bedrooms = num(values.bedrooms)
  const bathrooms = num(values.bathrooms)
  const squareFeet = num(values.squareFeet)
  const assessedValue = num(values.assessedValue)
  const askingPrice = num(values.askingPrice)
  if (bedrooms === null || bedrooms < 0) errors.bedrooms = 'Enter the number of rooms.'
  if (bathrooms === null || bathrooms < 0) errors.bathrooms = 'Enter the number of bathrooms.'
  if (squareFeet === null || squareFeet <= 0) errors.squareFeet = 'Enter the square footage.'
  if (!values.lotSize) errors.lotSize = 'Enter the land/lot size.'
  if (assessedValue === null || assessedValue < 0) errors.assessedValue = 'Enter the assessed value.'
  if (askingPrice === null || askingPrice < 0) errors.askingPrice = 'Enter the asking price.'

  const status = values.status as 'pending' | 'approved' | 'rejected'
  if (!['pending', 'approved', 'rejected'].includes(status)) errors.status = 'Choose a valid status.'

  const lat = num(values.lat)
  const lng = num(values.lng)
  if ((values.lat && lat === null) || (values.lng && lng === null)) errors.lat = 'Coordinates must be numbers.'

  const equityGenerated = num(values.equityGenerated)
  const tier = num(values.tier)
  const incomeRequirement = num(values.incomeRequirement)
  if (status === 'approved') {
    if (equityGenerated === null || equityGenerated < 0) {
      errors.equityGenerated = 'Set the equity generated for an approved property.'
    }
    if (tier === null || !Number.isInteger(tier) || tier < MIN_TIER || tier > MAX_TIER) {
      errors.tier = 'Choose a housing tier.'
    }
    if (incomeRequirement === null || incomeRequirement < 0) {
      errors.incomeRequirement = 'Set the monthly income requirement.'
    }
  }

  let galleryUrls: string[] = []
  if (values.galleryUrls) {
    try {
      const parsed = JSON.parse(values.galleryUrls)
      if (Array.isArray(parsed)) galleryUrls = parsed.filter((u) => typeof u === 'string')
    } catch {
      /* ignore */
    }
  }

  if (Object.keys(errors).length > 0) return { errors, values }

  const ok = await updateProperty(id, {
    address: {
      line1: values.line1,
      line2: values.line2 || undefined,
      city: values.city,
      state: values.state,
      postalCode: values.postalCode,
      country: values.country,
    },
    bedrooms: bedrooms!,
    bathrooms: bathrooms!,
    squareFeet: squareFeet!,
    lotSize: values.lotSize,
    coordinates: lat !== null && lng !== null ? { lat, lng } : undefined,
    thumbnailUrl: values.thumbnailUrl || undefined,
    galleryUrls,
    assessedValue: assessedValue!,
    askingPrice: askingPrice!,
    tier: tier ?? undefined,
    incomeRequirement: incomeRequirement ?? undefined,
    status,
    equityGenerated: equityGenerated ?? undefined,
  })

  if (!ok) return { message: 'Property not found.', values }

  revalidatePath('/admin/properties')
  revalidatePath(`/admin/properties/${id}`)
  revalidatePath('/properties')
  return { ok: true, values }
}

export async function adminDeletePropertyAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  await adminDeleteProperty(id)
  revalidatePath('/admin/properties')
  redirect('/admin/properties')
}

// ---- Tenant application review ----

export async function approveTenantAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Missing tenant id.' }

  const tenant = await getTenantById(id)
  if (!tenant) return { error: 'Tenant not found.' }
  // Fraud prevention: identity must be verified before approval.
  if (!tenant.identityVerified) {
    return { error: 'Tenant must complete identity verification (ID + selfie) before approval.' }
  }
  // The application fee must be paid before approval.
  if (tenant.fee.status !== 'paid') {
    return { error: 'The $25 application fee must be paid before approval.' }
  }

  const ok = await approveTenant(id)
  if (!ok) return { error: 'Tenant not found.' }

  // Remind the tenant to finish income verification (Plaid or paystub) — the
  // last step before we set up rent collection. Don't fail approval on email.
  try {
    await sendApprovalEmail({ to: tenant.email, name: tenant.name })
  } catch {
    /* email is best-effort */
  }

  revalidatePath('/admin/tenants')
  revalidatePath(`/admin/tenants/${id}`)
  return undefined
}

export async function rejectTenantAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (!id) return { error: 'Missing tenant id.' }
  const ok = await rejectTenant(id, reason || 'No reason provided.')
  if (!ok) return { error: 'Tenant not found.' }
  revalidatePath('/admin/tenants')
  revalidatePath(`/admin/tenants/${id}`)
  return undefined
}

// ---- Rent collection setup (admin-driven, after income is verified) ----

const RENT_INTERVALS: Record<BillingFrequency, { interval: 'week' | 'month'; interval_count: number }> = {
  weekly: { interval: 'week', interval_count: 1 },
  biweekly: { interval: 'week', interval_count: 2 },
  monthly: { interval: 'month', interval_count: 1 },
}

/**
 * Set up recurring rent for an approved tenant: the admin enters the 40% amount,
 * the draft frequency, and the first draft date (after reviewing Plaid income or
 * the uploaded paystub). Creates a Stripe subscription anchored to the first draft
 * date; the base amount is grossed up so the tenant covers Stripe's processing fee.
 */
export async function startTenantBillingAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireRole('admin', '/admin/login')

  const id = String(formData.get('id') ?? '')
  const baseAmount = Number(String(formData.get('amount') ?? '').trim())
  const frequency = String(formData.get('frequency') ?? '') as BillingFrequency
  const firstDraft = String(formData.get('firstDraft') ?? '').trim()

  if (!id) return { error: 'Missing tenant id.' }
  if (!RENT_INTERVALS[frequency]) return { error: 'Choose a draft frequency.' }
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
    return { error: 'Enter the recurring amount (40% of pay).' }
  }
  const draftDate = new Date(`${firstDraft}T12:00:00`)
  if (Number.isNaN(draftDate.getTime())) return { error: 'Choose the first draft date.' }
  const firstDraftEpoch = Math.floor(draftDate.getTime() / 1000)
  if (firstDraftEpoch <= Math.floor(Date.now() / 1000)) {
    return { error: 'The first draft date must be in the future.' }
  }

  const tenant = await getTenantById(id)
  if (!tenant) return { error: 'Tenant not found.' }
  if (tenant.status !== 'approved') return { error: 'Approve the tenant before setting up rent.' }
  if (!tenant.stripeCustomerId || !tenant.defaultPaymentMethodId) {
    return { error: 'Tenant has no saved payment method (application fee must be paid first).' }
  }
  if (tenant.billing?.status === 'active') return { error: 'Rent collection is already active.' }

  const baseAmountCents = Math.round(baseAmount * 100)
  const amountCents = withProcessingFee(baseAmountCents)

  let subscriptionId: string
  let subActive: boolean
  try {
    const stripe = getStripe()
    const product = await stripe.products.create({
      name: 'edynsgate rent (Effort Exchange)',
      metadata: { tenantId: id },
    })
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: amountCents,
      recurring: RENT_INTERVALS[frequency],
      product: product.id,
    })
    const subscription = await stripe.subscriptions.create({
      customer: tenant.stripeCustomerId,
      items: [{ price: price.id }],
      default_payment_method: tenant.defaultPaymentMethodId,
      trial_end: firstDraftEpoch, // first draft happens on this date, then recurs
      metadata: { tenantId: id },
    })
    subscriptionId = subscription.id
    subActive = subscription.status === 'active' || subscription.status === 'trialing'
  } catch {
    return { error: 'Stripe could not start rent collection. Check the date and the tenant’s payment method.' }
  }

  await setBilling(tenant.userId, {
    amountCents,
    baseAmountCents,
    frequency,
    stripeSubscriptionId: subscriptionId,
    status: subActive ? 'active' : 'past_due',
    firstDraftAt: draftDate,
    startedAt: new Date(),
  })
  // First monthly income/job-loss re-check lands on the first draft (≈ payday).
  await setNextIncomeCheck(id, draftDate)

  revalidatePath('/admin/tenants')
  revalidatePath(`/admin/tenants/${id}`)
  revalidatePath('/tenants')
  return undefined
}

/** Admin override of a tenant's employment type (self-employed + claimed hourly rate). */
export async function setTenantEmploymentTypeAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  const selfEmployed = formData.get('selfEmployed') === 'on' || formData.get('selfEmployed') === 'true'
  const rate = Number(String(formData.get('hourlyRate') ?? '').trim())
  if (!id) return { error: 'Missing tenant id.' }
  if (selfEmployed && !(Number.isFinite(rate) && rate > 0)) return { error: 'Enter the claimed hourly rate.' }

  await setEmploymentTypeById(id, { selfEmployed, claimedHourlyRate: selfEmployed ? rate : undefined })
  revalidatePath(`/admin/tenants/${id}`)
  return undefined
}

/** Resume rent after an admin reconfirms income for a tenant paused by the job-loss check. */
export async function resumeTenantBillingAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  const tenant = await getTenantById(id)
  if (tenant?.billing) {
    try {
      await getStripe().subscriptions.update(tenant.billing.stripeSubscriptionId, { pause_collection: '' })
    } catch {
      /* if Stripe update fails, still clear our flag; admin can retry */
    }
    const next = new Date()
    next.setMonth(next.getMonth() + 1)
    await resumeBilling(id, next)
  }
  revalidatePath('/admin/tenants')
  revalidatePath(`/admin/tenants/${id}`)
  redirect(`/admin/tenants/${id}`)
}

// ---- Move-in requests ----

export async function approveMoveInAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  const req = await getRequestById(id)
  if (req) {
    const property = await getPropertyById(req.propertyId)
    await setRequestStatus(id, 'approved')
    // Place the tenant at the property's tier.
    if (property) await placeTenant(req.tenantId, req.propertyId, property.tier ?? 0)
  }
  revalidatePath('/admin/move-ins')
}

export async function declineMoveInAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  await setRequestStatus(id, 'declined')
  revalidatePath('/admin/move-ins')
}

// ---- Payout approval ----

export async function approvePayoutAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')

  const payout = await getPayoutById(id)
  if (!payout || payout.status !== 'requested') redirect('/admin/payouts')

  const partner = await findPartnerById(payout!.partnerId)
  if (!partner?.stripeAccountId) redirect('/admin/payouts?error=no-account')

  // Execute the transfer; keep redirect() out of the try so it isn't swallowed.
  let transferId: string | null = null
  try {
    const account = await getStripe().accounts.retrieve(partner!.stripeAccountId!)
    if (account.payouts_enabled) {
      const transfer = await getStripe().transfers.create({
        amount: payout!.amountCents,
        currency: 'usd',
        destination: partner!.stripeAccountId!,
        metadata: { payoutId: id, partnerId: payout!.partnerId },
      })
      transferId = transfer.id
    }
  } catch {
    transferId = null
  }

  if (!transferId) redirect('/admin/payouts?error=transfer-failed')

  await markPayoutPaid(id, transferId)
  revalidatePath('/admin/payouts')
  redirect('/admin/payouts?paid=1')
}

export async function declinePayoutAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  const note = String(formData.get('note') ?? '').trim()
  await markPayoutDeclined(id, note || 'Declined by admin.')
  revalidatePath('/admin/payouts')
  redirect('/admin/payouts')
}
