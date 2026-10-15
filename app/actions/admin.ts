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
  transferProperty,
} from '@/lib/properties'
import { parsePropertyForm } from '@/lib/property-input'
import { updatePartner, deletePartner, findPartnerById, resetUserPassword } from '@/lib/users'
import {
  approveTenant,
  rejectTenant,
  placeTenant,
  unplaceTenant,
  getTenantById,
  getTenantBySubscriptionId,
  findTenantByProperty,
  attachStripeCustomer,
  setBilling,
  clearBilling,
  setNextIncomeCheck,
  setEmploymentTypeById,
  resumeBilling,
  resetVerification,
  markIdentityVerifiedManually,
  markFeeCollectedOffline,
  setVerifiedIncomeManually,
  type BillingFrequency,
} from '@/lib/tenants'
import { removePlaidItem } from '@/lib/plaid'
import { decryptString } from '@/lib/crypto'
import { getRequestById, setRequestStatus } from '@/lib/moveins'
import {
  getPayoutById,
  markPayoutPaid,
  markPayoutDeclined,
  createPaidPayout,
  totalPaidCentsByPartner,
  pendingCentsByPartner,
} from '@/lib/payouts'
import { totalEquityCentsByPartner, recordRentEquity, repricePropertyEquity } from '@/lib/equity'
import { getStripe, withProcessingFee, fetchSubscriptionForImport, type ImportedSubscription } from '@/lib/stripe'
import { sendApprovalEmail, sendWelcomeBackEmail, sendVerificationResetEmail } from '@/lib/email'
import { MIN_TIER, MAX_TIER } from '@/lib/tiers'

export type AdminActionState = { error?: string } | undefined

export async function approvePropertyAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireRole('admin', '/admin/login')

  const id = String(formData.get('id') ?? '')
  const equity = Number(String(formData.get('equityGenerated') ?? '').trim())
  const tier = Number(String(formData.get('tier') ?? '').trim())
  const incomeRequirement = Number(String(formData.get('incomeRequirement') ?? '').trim())
  const shareRaw = String(formData.get('equitySharePercent') ?? '').trim()
  const equitySharePercent = shareRaw === '' ? 10 : Number(shareRaw)

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
  if (!Number.isFinite(equitySharePercent) || equitySharePercent < 0 || equitySharePercent > 100) {
    return { error: 'Partner equity share must be a percent between 0 and 100.' }
  }

  const ok = await approveProperty(id, { equityGenerated: equity, tier, incomeRequirement, equitySharePercent })
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

export async function updatePropertyAction(_prev: PropertyEditState, formData: FormData): Promise<PropertyEditState> {
  await requireRole('admin', '/admin/login')

  const id = String(formData.get('id') ?? '').trim()
  const parsed = parsePropertyForm(formData, { admin: true })
  if (!parsed.ok) return { errors: parsed.errors, values: parsed.values }
  const { values, input, admin } = parsed

  const existing = await getPropertyById(id)
  if (!existing) return { message: 'Property not found.', values }

  // Ownership transfer (property bought/sold). The new owner must be a real
  // partner and the admin must explicitly confirm, because this moves where
  // future rent equity accrues. Done first so a bad partner id changes nothing.
  const newPartnerId = String(formData.get('partnerId') ?? '').trim()
  const transferring = newPartnerId !== '' && newPartnerId !== existing.partnerId
  if (transferring) {
    if (formData.get('confirmTransfer') !== 'on') {
      return { errors: { partnerId: 'Confirm the ownership transfer to continue.' }, values }
    }
    if (!(await findPartnerById(newPartnerId))) {
      return { errors: { partnerId: 'Choose an existing partner.' }, values }
    }
  }

  const ok = await updateProperty(id, {
    ...input,
    status: admin!.status,
    equityGenerated: admin!.equityGenerated,
    equitySharePercent: admin!.equitySharePercent,
  })
  if (!ok) return { message: 'Property not found.', values }

  if (transferring && !(await transferProperty(id, existing.partnerId, newPartnerId))) {
    return { message: 'Saved, but ownership changed elsewhere in the meantime — reload and try the transfer again.', values }
  }

  // A changed equity share applies immediately to all accrued (unsent) equity,
  // not just future payments — reprice this property's ledger entries.
  if (admin!.equitySharePercent !== undefined) {
    await repricePropertyEquity(id, admin!.equitySharePercent)
  }

  revalidatePath('/admin/properties')
  revalidatePath(`/admin/properties/${id}`)
  revalidatePath('/properties')
  revalidatePath('/partners/properties')
  revalidatePath('/partners/payouts')
  revalidatePath('/partners')
  return { ok: true, values }
}

export async function adminDeletePropertyAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  await adminDeleteProperty(id)
  revalidatePath('/admin/properties')
  redirect('/admin/properties')
}

/**
 * Record a cash rent payment on a property (e.g. the tenant paid in office because
 * their auto-draft failed). It accrues partner equity exactly like an automatic
 * payment — the property's share % of the amount — tagged as a cash payment.
 */
export async function addCashRentPaymentAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const propertyId = String(formData.get('propertyId') ?? '').trim()
  const amount = Number(String(formData.get('amount') ?? '').trim())
  const dateStr = String(formData.get('paidAt') ?? '').trim()
  const back = `/admin/properties/${propertyId}`

  const property = await getPropertyById(propertyId)
  if (!property || property.status !== 'approved') redirect(`${back}?cash=error`)
  if (!Number.isFinite(amount) || amount <= 0) redirect(`${back}?cash=amount`)

  // Equity is credited against the tenant currently placed at the property.
  const tenant = await findTenantByProperty(propertyId)
  if (!tenant) redirect(`${back}?cash=no-tenant`)

  const paidAt = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date()
  if (Number.isNaN(paidAt.getTime())) redirect(`${back}?cash=date`)

  const rentCents = Math.round(amount * 100)
  const sharePercent = property.equitySharePercent ?? 10
  const equityCents = Math.round((rentCents * sharePercent) / 100)

  await recordRentEquity({
    partnerId: property.partnerId,
    propertyId,
    tenantId: tenant.id,
    source: 'cash',
    rentCents,
    sharePercent,
    equityCents,
    paidAt,
  })

  revalidatePath(back)
  revalidatePath('/partners/properties')
  revalidatePath('/partners/payouts')
  revalidatePath('/partners')
  redirect(`${back}?cash=recorded`)
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

// ---- Account access (welcome / welcome-back emails) ----

/**
 * Issue a fresh temporary password for a tenant or partner user and email it to
 * them with sign-in instructions. Helps set up imported users (who have no usable
 * password) and refresh anyone who missed steps or lost their password. The user
 * is forced to choose a new password on next sign-in.
 */
export async function resendWelcomeEmailAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const userId = String(formData.get('userId') ?? '').trim()
  const returnTo = String(formData.get('returnTo') ?? '').trim()
  // Only allow returning to an admin path (no open redirect).
  const dest = returnTo.startsWith('/admin/') ? returnTo : '/admin/tenants'

  const reset = await resetUserPassword(userId)
  if (!reset) redirect(`${dest}?welcome=notfound`)

  let sent = true
  try {
    await sendWelcomeBackEmail({
      to: reset.email,
      name: reset.name,
      tempPassword: reset.tempPassword,
      role: reset.role,
    })
  } catch {
    sent = false
  }
  redirect(`${dest}?welcome=${sent ? 'sent' : 'failed'}`)
}

// ---- Manual overrides (paper / Stripe-imported tenants) ----

/**
 * Admin attests they checked the tenant's government ID themselves (in person /
 * paper application), bypassing Stripe Identity. Requires an explicit confirm
 * because it bypasses the automated fraud check; recorded as identityManual so
 * it stays distinguishable from a Stripe-verified ID.
 */
export async function markIdentityVerifiedManuallyAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '').trim()
  const back = `/admin/tenants/${id}`
  if (formData.get('confirm') !== 'on') redirect(`${back}?override=confirm`)

  await markIdentityVerifiedManually(id)
  revalidatePath('/admin/tenants')
  revalidatePath(back)
  revalidatePath('/tenants')
  redirect(`${back}?override=identity`)
}

/**
 * Admin manually approves income after reviewing evidence themselves (uploaded
 * paystub, employer call). Records verified gross monthly income + weekly hours —
 * the same fields Plaid sets — so rent setup and the 35-hour check work as usual.
 */
export async function approveTenantIncomeAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '').trim()
  const monthlyIncome = Number(String(formData.get('monthlyIncome') ?? '').trim())
  const weeklyHours = Number(String(formData.get('weeklyHours') ?? '').trim())

  if (!id) return { error: 'Missing tenant id.' }
  if (formData.get('confirm') !== 'on') {
    return { error: 'Confirm you reviewed the income evidence before approving.' }
  }
  if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) {
    return { error: 'Enter the verified gross monthly income.' }
  }
  if (!Number.isFinite(weeklyHours) || weeklyHours <= 0 || weeklyHours > 100) {
    return { error: 'Enter the verified weekly hours (1–100).' }
  }

  const ok = await setVerifiedIncomeManually(id, { monthlyIncome, weeklyHours })
  if (!ok) return { error: 'Tenant not found.' }

  revalidatePath('/admin/tenants')
  revalidatePath(`/admin/tenants/${id}`)
  revalidatePath('/tenants')
  return undefined
}

/** Mark the $25 application fee as collected outside the app (cash / Stripe-side). */
export async function markFeeCollectedOfflineAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '').trim()
  const back = `/admin/tenants/${id}`
  if (formData.get('confirm') !== 'on') redirect(`${back}?override=confirm`)

  await markFeeCollectedOffline(id)
  revalidatePath('/admin/tenants')
  revalidatePath(back)
  revalidatePath('/tenants')
  redirect(`${back}?override=fee`)
}

// ---- Verification reset (stuck applicants) ----

/**
 * Wipe a tenant's verification progress so they can re-enter info and start the
 * flow over (for applicants stuck mid-verification — e.g. Plaid "confirming"
 * forever, an abandoned Stripe Identity session, or the bank-link cap).
 *
 * Order matters: external cleanup happens BEFORE the DB reset so stale sessions
 * can't complete later and re-verify a tenant we just reset —
 *  1. cancel the open Stripe Identity session (no-op if already finished),
 *  2. remove the Plaid Item (invalidates the token, stops its webhooks),
 *  3. clear all verification fields (resetVerification keeps the application
 *     info, paid fee, saved payment method, and status).
 * Blocked while a rent subscription exists — see resetVerification.
 */
export async function resetTenantVerificationAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '').trim()
  const back = `/admin/tenants/${id}`
  if (formData.get('confirm') !== 'on') redirect(`${back}?reset=confirm`)

  const tenant = await getTenantById(id)
  if (!tenant) redirect('/admin/tenants')
  if (tenant.billing) redirect(`${back}?reset=billing`)

  if (tenant.stripeIdentitySessionId && !tenant.identityVerified) {
    try {
      await getStripe().identity.verificationSessions.cancel(tenant.stripeIdentitySessionId)
    } catch {
      /* only cancellable while requires_input — fine, the DB reset still clears it */
    }
  }
  if (tenant.plaidAccessTokenEnc) {
    try {
      await removePlaidItem(decryptString(tenant.plaidAccessTokenEnc))
    } catch {
      /* already removed at Plaid / key rotated — don't block the reset */
    }
  }

  // Can return false if rent setup raced us since the pre-check above.
  const ok = await resetVerification(id)
  if (!ok) redirect(`${back}?reset=billing`)

  try {
    await sendVerificationResetEmail({ to: tenant.email, name: tenant.name })
  } catch {
    /* email is best-effort */
  }

  revalidatePath('/admin/tenants')
  revalidatePath(back)
  revalidatePath('/tenants')
  redirect(`${back}?reset=done`)
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

// ---- Importing manually-created Stripe subscriptions (one-off tenants) ----

export type StripeLookupState =
  | { subscriptionId: string; data: ImportedSubscription }
  | { error: string }
  | undefined

/** Preview an existing Stripe subscription before importing it. Read-only. */
export async function lookupStripeSubscriptionAction(
  _prev: StripeLookupState,
  formData: FormData,
): Promise<StripeLookupState> {
  await requireRole('admin', '/admin/login')
  const subscriptionId = String(formData.get('subscriptionId') ?? '').trim()
  if (!subscriptionId) return { error: 'Paste the Stripe subscription id.' }

  const existing = await getTenantBySubscriptionId(subscriptionId)
  if (existing) return { error: `That subscription is already linked to ${existing.name}.` }

  const result = await fetchSubscriptionForImport(subscriptionId)
  if (!result.ok) return { error: result.error }
  return { subscriptionId, data: result.data }
}

/**
 * Commit the import: record the existing subscription as the tenant's rent billing,
 * mark them approved (they're already paying), and place them at the chosen property.
 */
export async function importStripeSubscriptionAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const tenantId = String(formData.get('tenantId') ?? '').trim()
  const subscriptionId = String(formData.get('subscriptionId') ?? '').trim()
  const propertyId = String(formData.get('propertyId') ?? '').trim()
  if (!tenantId || !subscriptionId || !propertyId) redirect('/admin/tenants/import?error=missing')

  const tenant = await getTenantById(tenantId)
  if (!tenant) redirect('/admin/tenants/import?error=tenant')
  if (tenant.billing) redirect(`/admin/tenants/${tenantId}?error=already-billed`)

  if (await getTenantBySubscriptionId(subscriptionId)) redirect('/admin/tenants/import?error=linked')

  const result = await fetchSubscriptionForImport(subscriptionId)
  if (!result.ok) redirect('/admin/tenants/import?error=stripe')

  const property = await getPropertyById(propertyId)
  if (!property || property.status !== 'approved') redirect('/admin/tenants/import?error=property')

  await attachStripeCustomer(tenant.userId, result.data.customerId)
  await setBilling(tenant.userId, {
    amountCents: result.data.amountCents,
    baseAmountCents: result.data.amountCents,
    frequency: result.data.frequency,
    stripeSubscriptionId: subscriptionId,
    status: result.data.status,
    firstDraftAt: result.data.nextDraftAt,
    startedAt: new Date(),
    imported: true,
  })
  await approveTenant(tenantId)
  await placeTenant(tenantId, propertyId, property.tier ?? 0, property.address)

  revalidatePath('/admin/tenants')
  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath('/tenants')
  redirect(`/admin/tenants/${tenantId}`)
}

/**
 * Replace an imported subscription with the normal 40% model: cancel the imported
 * subscription in Stripe and clear the billing record, returning the tenant to the
 * standard rent-setup state so the admin can start the 40% subscription.
 */
export async function replaceImportedWithBillingAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '').trim()
  const tenant = await getTenantById(id)
  if (tenant?.billing?.imported) {
    try {
      await getStripe().subscriptions.cancel(tenant.billing.stripeSubscriptionId)
    } catch {
      /* already canceled / missing in Stripe — clear our record regardless */
    }
    await clearBilling(id)
  }
  revalidatePath('/admin/tenants')
  revalidatePath(`/admin/tenants/${id}`)
  revalidatePath('/tenants')
  redirect(`/admin/tenants/${id}`)
}

// ---- Move-in requests ----

export async function approveMoveInAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  const req = await getRequestById(id)
  if (req && req.status === 'requested') {
    const property = await getPropertyById(req.propertyId)
    await setRequestStatus(id, 'approved')
    // Place the tenant at the property's tier and move their address to the new home.
    if (property) await placeTenant(req.tenantId, req.propertyId, property.tier ?? 0, property.address)
  }
  revalidatePath('/admin/move-ins')
  revalidatePath('/tenants')
}

export async function declineMoveInAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  await setRequestStatus(id, 'declined')
  revalidatePath('/admin/move-ins')
}

/**
 * Undo an approved move-in. `reverse` treats it as an admin mistake; `evict`
 * records a tenant removal. Both release the tenant from the property and
 * restore the address/tier they had before the move-in.
 */
async function undoMoveIn(formData: FormData, status: 'reversed' | 'evicted'): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  const req = await getRequestById(id)
  if (req && req.status === 'approved') {
    await unplaceTenant(req.tenantId, req.propertyId)
    await setRequestStatus(id, status)
  }
  revalidatePath('/admin/move-ins')
  revalidatePath('/tenants')
}

export async function reverseMoveInAction(formData: FormData): Promise<void> {
  await undoMoveIn(formData, 'reversed')
}

export async function evictMoveInAction(formData: FormData): Promise<void> {
  await undoMoveIn(formData, 'evicted')
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

/**
 * Admin force payout: pay out a partner's full available balance immediately
 * (ledger total − already paid − pending), transferring via Stripe Connect and
 * recording a paid payout. Available drops to zero; lifetime equity is unchanged.
 */
export async function forcePayoutAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const partnerId = String(formData.get('partnerId') ?? '').trim()
  const back = `/admin/partners/${partnerId}`

  const partner = await findPartnerById(partnerId)
  if (!partner?.stripeAccountId) redirect(`${back}?payout=no-account`)

  const [totalCents, paidCents, pendingCents] = await Promise.all([
    totalEquityCentsByPartner(partnerId),
    totalPaidCentsByPartner(partnerId),
    pendingCentsByPartner(partnerId),
  ])
  const availableCents = totalCents - paidCents - pendingCents
  if (availableCents <= 0) redirect(`${back}?payout=nothing`)

  // Execute the transfer; keep redirect() out of the try so it isn't swallowed.
  let transferId: string | null = null
  try {
    const account = await getStripe().accounts.retrieve(partner!.stripeAccountId!)
    if (account.payouts_enabled) {
      const transfer = await getStripe().transfers.create({
        amount: availableCents,
        currency: 'usd',
        destination: partner!.stripeAccountId!,
        metadata: { partnerId, forced: 'true' },
      })
      transferId = transfer.id
    }
  } catch {
    transferId = null
  }

  if (!transferId) redirect(`${back}?payout=transfer-failed`)

  await createPaidPayout(partnerId, availableCents, transferId)
  revalidatePath('/admin/payouts')
  revalidatePath(back)
  redirect(`${back}?payout=paid`)
}
