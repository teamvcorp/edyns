import 'server-only'

import { ObjectId, type Collection } from 'mongodb'
import { getDb } from './mongodb'
import { deletePaystubFile } from './paystubs'
import type { Address } from './users'
import { PROGRAMS, OUTSIDE_LANDLORD_PROGRAMS, type ProgramId } from './programs'

export interface Person {
  name: string
  dob: string // ISO date string (yyyy-mm-dd)
}

export type VerificationMethod = 'plaid' | 'manual'

export interface Employment {
  employer: string
  jobTitle: string
  monthlyIncome: number
  employerPhone?: string
  /** Self-employed tenants verify via Bank deposits (no payroll); hours are implied from rate. */
  selfEmployed?: boolean
  /** Self-employed: claimed hourly rate, used to imply weekly hours from verified income. */
  claimedHourlyRate?: number
  /** Set once income is confirmed (bank connected through Plaid). */
  verified?: boolean
  /** How income was evidenced: Plaid bank connection or a manually uploaded paystub. */
  verificationMethod?: VerificationMethod
  /** Monthly income derived from Plaid Bank/Payroll Income, when available. */
  verifiedMonthlyIncome?: number
  /** Average hours worked per week (payroll actual, or implied for self-employed). */
  verifiedWeeklyHours?: number
  /** Most recent pay/deposit date seen (used by the monthly job-loss check). ISO date. */
  lastPayDate?: string
  verifiedAt?: Date
}

export type BillingStatus = 'none' | 'active' | 'past_due' | 'canceled' | 'paused'
export type BillingFrequency = 'weekly' | 'biweekly' | 'monthly'

export interface Billing {
  /** Per-draft charge in cents (base grossed up so the tenant covers Stripe's fee). */
  amountCents: number
  /** The base per-draft amount (rent + car, before processing fee) the admin entered, in cents. */
  baseAmountCents: number
  /** How often rent drafts. */
  frequency: BillingFrequency
  stripeSubscriptionId: string
  status: BillingStatus
  /** When the first draft occurs (Stripe trial_end / billing anchor). */
  firstDraftAt: Date
  startedAt: Date
  /**
   * True when this subscription was created manually in Stripe and imported into
   * the app (one-off tenants not in the normal flow), rather than created by the
   * program-rate setup. For these the `baseAmountCents` mirrors `amountCents`.
   */
  imported?: boolean
  /** Next scheduled draft, set when an admin changes the terms (else see firstDraftAt / Stripe). */
  nextDraftAt?: Date
  /**
   * Present while status is 'paused'. `source` tells who paused it: an admin
   * (manual, optional auto-resume date) or the monthly income check (resume only
   * after income is reconfirmed). Records without it predate this field and were
   * income-check pauses.
   */
  pause?: { at: Date; source: 'admin' | 'income_check'; reason?: string; resumesAt?: Date }
  /**
   * How `baseAmountCents` divides between rent and the car program (programs with a
   * car component). Absent for Effort Exchange / imported billing = all rent.
   * The same split is stamped on the Stripe price metadata, which the webhook
   * reads so past invoices are never re-split by a later change.
   */
  split?: { rentCents: number; carCents: number }
}

/**
 * The outside landlord we forward rent to (own_landlord / own_landlord_car). The rental
 * address is the tenant's `address` — they live in the home they're renting.
 */
export interface Landlord {
  name: string
  phone: string
  email?: string
  /** Where the landlord receives rent (mailing address / bill-pay details). Free text. */
  paymentAddress?: string
  /** Monthly rent owed to the landlord, per the lease, in cents. */
  monthlyRentCents: number
}

/** Audit entry for an admin change to rent terms (amount / frequency / next draft date). */
export interface BillingChange {
  at: Date
  from: { baseAmountCents: number; amountCents: number; frequency: BillingFrequency }
  to: { baseAmountCents: number; amountCents: number; frequency: BillingFrequency; nextDraftAt: Date }
  note?: string
}

export const RENT_CREDIT_METHODS = ['cash', 'check', 'money_order', 'bank_transfer', 'other'] as const
export type RentCreditMethod = (typeof RENT_CREDIT_METHODS)[number]

/**
 * A rent credit recorded for a payment made outside Stripe (cash, check, …).
 * The credit itself lives on the Stripe customer balance and reduces the next
 * draft(s); this is our audit copy.
 */
export interface RentCredit {
  stripeTransactionId: string
  amountCents: number
  method: RentCreditMethod
  reference?: string
  note?: string
  receivedAt: Date
  recordedAt: Date
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected'
export type FeeStatus = 'unpaid' | 'processing' | 'paid'

/**
 * Own-landlord monthly rent shortfall (set by the rent-shortfall cron). One per
 * month: `month` is 'YYYY-MM'. The tenant may pay `amountCents` (base, before
 * processing fee) once via Checkout; the webhook records it in the program
 * ledger and sets `paidAt`.
 */
/**
 * Bank connection for per-paycheck collection (Plaid Transactions; see
 * docs/plans/paycheck-collection.md). The SAME account is watched for paychecks
 * and debited through Stripe — `mask` must match the Stripe bank account's last 4.
 */
export interface BankLink {
  itemId: string
  /** AES-256-GCM encrypted Plaid access token (lib/crypto.ts). Never sent to the browser. */
  accessTokenEnc: string
  /** The checking/savings account the paycheck lands in. */
  accountId: string
  mask?: string
  institution?: string
  /** /transactions/sync cursor; advanced only after a complete pagination run. */
  cursor?: string
  status: 'active' | 'needs_relink' | 'removed'
  statusReason?: string
  linkedAt: Date
  lastSyncedAt?: Date
  /** Plaid Statements (income fallback): consent collected via additional_consented_products. */
  statements?: { requestedAt?: Date; status?: 'needs_consent' | 'fetched' | 'unsupported' | 'error'; fetchedAt?: Date }
}

/**
 * The tenant's authorization for variable per-paycheck debits (Nacha: disclose
 * how amounts are calculated; Reg E: variable-amount range). Kept verbatim so it
 * can be produced as proof of authorization. Wording reviewed by counsel 2026-11-14.
 */
export interface PaycheckAuthorization {
  acceptedAt: Date
  /** Version id of the authorization text shown (lib/paychecks.ts AUTHORIZATION_VERSION). */
  textVersion: string
  /** The exact text the tenant accepted. */
  text: string
  /** Debits above this (base, before fee) are held for review instead of auto-collected. */
  rangeMaxCents: number
  accountMask?: string
  ip?: string
  userAgent?: string
}

/** Per-paycheck collection mode state (absent = fixed schedule via `billing`). */
export interface PaycheckMode {
  status: 'active' | 'paused'
  startedAt: Date
  /** Deposits dated before this are NEVER collected (initial sync returns history). */
  collectFrom: Date
  pausedAt?: Date
  pausedReason?: string
}

export interface ShortfallNotice {
  month: string
  amountCents: number
  notifiedAt: Date
  checkoutSessionId?: string
  paidAt?: Date
}

export interface TenantDoc {
  _id: ObjectId
  userId: ObjectId
  // Head of household (name/email mirror the user account for easy admin display)
  name: string
  email: string
  phone: string
  dob: string
  address: Address
  adults: Person[] // additional household members 18+
  children: Person[]
  employment: Employment
  /** Which program they enrolled in (lib/programs.ts). Absent on legacy records = 'effort_exchange'; read via programOf(). */
  program?: ProgramId
  /** Outside-landlord programs only: who we pay rent to. */
  landlord?: Landlord
  /** Outside-landlord programs only: lease metadata; the encrypted file lives in `leases` (lib/leases.ts). */
  lease?: { uploadedAt: Date; contentType: string }
  /** Outside-landlord programs only: the latest monthly rent shortfall notice. */
  shortfall?: ShortfallNotice
  /** Per-paycheck collection (feature-flagged): bank connection, authorization, mode. */
  bankLink?: BankLink
  paycheckAuthorization?: PaycheckAuthorization
  paycheck?: PaycheckMode
  status: ApplicationStatus
  rejectionReason?: string
  fee: {
    status: FeeStatus
    amountCents: number
    stripeSessionId?: string
    paymentIntentId?: string
    paidAt?: Date
    /** True when the fee was collected outside the app (cash / Stripe-side) and an admin marked it paid. */
    offline?: boolean
  }
  stripeCustomerId?: string
  defaultPaymentMethodId?: string
  /** Plaid: user token + encrypted access token for income verification. */
  plaidUserToken?: string
  /** Plaid user_id — keys user-based income webhooks (e.g. BANK_INCOME_REFRESH_COMPLETE). */
  plaidUserId?: string
  plaidAccessTokenEnc?: string
  plaidItemId?: string
  /** Stripe Identity (government ID + selfie). Full ID never stored — only last 4. */
  stripeIdentitySessionId?: string
  identityVerified?: boolean
  identityVerifiedAt?: Date
  /** True when an admin attested the ID in person instead of Stripe Identity (paper/imported tenants). */
  identityManual?: boolean
  idNumberLast4?: string
  /**
   * Admin-uploaded paystub (last resort when Plaid can't verify). The file itself
   * is encrypted in the `paystubs` collection (lib/paystubs.ts) — only metadata
   * lives here. `url` exists only on LEGACY records from when tenants uploaded
   * to public Blob storage; new uploads never set it.
   */
  paystub?: { uploadedAt: Date; contentType?: string; url?: string }
  /** Bank-link velocity monitoring (Plaid): number of completed link attempts. */
  plaidLinkCount?: number
  /** Set when automated checks flag this application for manual security review. */
  flaggedForReview?: boolean
  reviewReason?: string
  flaggedAt?: Date
  /** Recurring collection (program rate of income, lib/programs.ts) via Stripe. */
  billing?: Billing
  /** Admin changes to rent terms, oldest first. */
  billingHistory?: BillingChange[]
  /** Earlier (canceled) billing records, archived when rent is restarted. Oldest first. */
  previousBillings?: Billing[]
  /** Alternative-payment credits applied to the Stripe balance, oldest first. */
  rentCredits?: RentCredit[]
  /** When the next monthly income/job-loss re-check is due (set when billing starts). */
  nextIncomeCheckAt?: Date
  /** Tenants start at tier 0 on approval and move up as they relocate. */
  currentTier?: number
  currentPropertyId?: ObjectId
  /**
   * Property the tenant found us through (set from an admin invite). A HINT for
   * admin context and client reassurance only — it never creates a move-in
   * request and grants no claim on the home; placement still needs approval.
   */
  interestedPropertyId?: ObjectId
  createdAt: Date
  updatedAt: Date
  approvedAt?: Date
}

export type Tenant = Omit<TenantDoc, '_id' | 'userId' | 'currentPropertyId' | 'interestedPropertyId'> & {
  id: string
  userId: string
  currentPropertyId?: string
  interestedPropertyId?: string
}

async function tenantsCollection(): Promise<Collection<TenantDoc>> {
  const db = await getDb()
  const col = db.collection<TenantDoc>('tenants')
  await col.createIndex({ userId: 1 }, { unique: true })
  await col.createIndex({ status: 1 })
  await col.createIndex({ 'fee.stripeSessionId': 1 })
  await col.createIndex({ 'billing.stripeSubscriptionId': 1 })
  await col.createIndex({ stripeCustomerId: 1 })
  await col.createIndex({ plaidItemId: 1 })
  await col.createIndex({ plaidUserId: 1 })
  await col.createIndex({ program: 1 })
  await col.createIndex({ 'bankLink.itemId': 1 })
  return col
}

function toTenant(doc: TenantDoc): Tenant {
  const { _id, userId, currentPropertyId, interestedPropertyId, ...rest } = doc
  return {
    ...rest,
    id: _id.toString(),
    userId: userId.toString(),
    currentPropertyId: currentPropertyId?.toString(),
    interestedPropertyId: interestedPropertyId?.toString(),
  }
}

export async function createTenantApplication(
  userId: string,
  input: {
    name: string
    email: string
    phone: string
    dob: string
    address: Address
    adults: Person[]
    children: Person[]
    employment: Employment
    feeAmountCents: number
    /** From an admin invite — see TenantDoc.interestedPropertyId. */
    interestedPropertyId?: string
    program: ProgramId
    landlord?: Landlord
  },
): Promise<Tenant> {
  const col = await tenantsCollection()
  const now = new Date()
  const doc: TenantDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    name: input.name,
    email: input.email,
    phone: input.phone,
    dob: input.dob,
    address: input.address,
    adults: input.adults,
    children: input.children,
    employment: input.employment,
    program: input.program,
    // Only programs that forward rent carry landlord details (never trust the caller to omit them).
    landlord: PROGRAMS[input.program].outsideLandlord ? input.landlord : undefined,
    status: 'pending',
    fee: { status: 'unpaid', amountCents: input.feeAmountCents },
    interestedPropertyId:
      input.interestedPropertyId && ObjectId.isValid(input.interestedPropertyId)
        ? new ObjectId(input.interestedPropertyId)
        : undefined,
    createdAt: now,
    updatedAt: now,
  }
  await col.insertOne(doc)
  return toTenant(doc)
}

// ---- Own-landlord monthly shortfall ----

/** Approved own-landlord tenants with live (non-canceled) collection — the shortfall cron's input. */
export async function listTenantsForShortfallCheck(): Promise<Tenant[]> {
  const col = await tenantsCollection()
  const docs = await col
    .find({
      status: 'approved',
      program: { $in: [...OUTSIDE_LANDLORD_PROGRAMS] },
      'billing.status': { $in: ['active', 'past_due', 'paused'] },
    })
    .toArray()
  return docs.map(toTenant)
}

/**
 * Save this month's shortfall notice. Atomic + once per month: returns false if
 * a notice for `month` already exists (cron re-runs never email twice).
 */
export async function setShortfallNotice(tenantId: string, month: string, amountCents: number): Promise<boolean> {
  if (!ObjectId.isValid(tenantId)) return false
  const col = await tenantsCollection()
  const notice: ShortfallNotice = { month, amountCents, notifiedAt: new Date() }
  const res = await col.updateOne(
    { _id: new ObjectId(tenantId), 'shortfall.month': { $ne: month } },
    { $set: { shortfall: notice, updatedAt: new Date() } },
  )
  return res.modifiedCount === 1
}

/** Remember the Checkout session started for a shortfall (lets the tenant resume it). */
export async function setShortfallSession(tenantId: string, month: string, sessionId: string): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await tenantsCollection()
  await col.updateOne(
    { _id: new ObjectId(tenantId), 'shortfall.month': month },
    { $set: { 'shortfall.checkoutSessionId': sessionId, updatedAt: new Date() } },
  )
}

/** Mark a month's shortfall paid (webhook, after the ledger entry is recorded). */
export async function markShortfallPaid(tenantId: string, month: string, paidAt: Date): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await tenantsCollection()
  await col.updateOne(
    { _id: new ObjectId(tenantId), 'shortfall.month': month, 'shortfall.paidAt': { $exists: false } },
    { $set: { 'shortfall.paidAt': paidAt, updatedAt: new Date() } },
  )
}

// ---- Per-paycheck collection (docs/plans/paycheck-collection.md) ----

/** Save a new bank connection (replaces any previous one; the caller removes the old Plaid Item). */
export async function setBankLink(tenantId: string, link: BankLink): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await tenantsCollection()
  await col.updateOne({ _id: new ObjectId(tenantId) }, { $set: { bankLink: link, updatedAt: new Date() } })
}

export async function getTenantByBankItem(itemId: string): Promise<Tenant | null> {
  if (!itemId) return null
  const col = await tenantsCollection()
  const doc = await col.findOne({ 'bankLink.itemId': itemId })
  return doc ? toTenant(doc) : null
}

/** Advance the sync cursor — only after a COMPLETE /transactions/sync pagination run. */
export async function setBankCursor(tenantId: string, cursor: string): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await tenantsCollection()
  await col.updateOne(
    { _id: new ObjectId(tenantId) },
    { $set: { 'bankLink.cursor': cursor, 'bankLink.lastSyncedAt': new Date(), updatedAt: new Date() } },
  )
}

export async function setBankLinkStatus(tenantId: string, status: BankLink['status'], reason?: string): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await tenantsCollection()
  await col.updateOne(
    { _id: new ObjectId(tenantId) },
    { $set: { 'bankLink.status': status, 'bankLink.statusReason': reason, updatedAt: new Date() } },
  )
}

export async function setStatementsState(tenantId: string, state: NonNullable<BankLink['statements']>): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await tenantsCollection()
  await col.updateOne({ _id: new ObjectId(tenantId) }, { $set: { 'bankLink.statements': state, updatedAt: new Date() } })
}

/** Tenants with an active bank connection (fallback sync cron). */
export async function listTenantsWithActiveBankLinks(): Promise<Tenant[]> {
  const col = await tenantsCollection()
  const docs = await col.find({ 'bankLink.status': 'active' }).toArray()
  return docs.map(toTenant)
}

export async function recordPaycheckAuthorization(tenantId: string, auth: PaycheckAuthorization): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await tenantsCollection()
  await col.updateOne({ _id: new ObjectId(tenantId) }, { $set: { paycheckAuthorization: auth, updatedAt: new Date() } })
}

/** Turn paycheck mode on (or back on). `collectFrom` = now unless resuming keeps the original. */
export async function startPaycheckMode(tenantId: string, opts: { keepCollectFrom?: boolean } = {}): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await tenantsCollection()
  const now = new Date()
  const existing = opts.keepCollectFrom ? await col.findOne({ _id: new ObjectId(tenantId) }) : null
  const mode: PaycheckMode = {
    status: 'active',
    startedAt: existing?.paycheck?.startedAt ?? now,
    collectFrom: existing?.paycheck?.collectFrom ?? now,
  }
  await col.updateOne({ _id: new ObjectId(tenantId) }, { $set: { paycheck: mode, updatedAt: now } })
}

export async function pausePaycheckMode(tenantId: string, reason: string): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await tenantsCollection()
  await col.updateOne(
    { _id: new ObjectId(tenantId), paycheck: { $exists: true } },
    { $set: { 'paycheck.status': 'paused', 'paycheck.pausedAt': new Date(), 'paycheck.pausedReason': reason, updatedAt: new Date() } },
  )
}

/** Record that a lease was stored (the file itself is in lib/leases.ts). */
export async function recordLeaseUpload(tenantId: string, lease: { uploadedAt: Date; contentType: string }): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await tenantsCollection()
  await col.updateOne({ _id: new ObjectId(tenantId) }, { $set: { lease, updatedAt: new Date() } })
}

export async function getTenantByUserId(userId: string): Promise<Tenant | null> {
  if (!ObjectId.isValid(userId)) return null
  const col = await tenantsCollection()
  const doc = await col.findOne({ userId: new ObjectId(userId) })
  return doc ? toTenant(doc) : null
}

export async function getTenantById(id: string): Promise<Tenant | null> {
  if (!ObjectId.isValid(id)) return null
  const col = await tenantsCollection()
  const doc = await col.findOne({ _id: new ObjectId(id) })
  return doc ? toTenant(doc) : null
}

/** Find the tenant a Stripe subscription is already linked to (guards double-import). */
export async function getTenantBySubscriptionId(subscriptionId: string): Promise<Tenant | null> {
  const col = await tenantsCollection()
  const doc = await col.findOne({ 'billing.stripeSubscriptionId': subscriptionId })
  return doc ? toTenant(doc) : null
}

/** The tenant currently placed at a property (regardless of billing status), if any. */
export async function findTenantByProperty(propertyId: string): Promise<Tenant | null> {
  if (!ObjectId.isValid(propertyId)) return null
  const col = await tenantsCollection()
  const doc = await col.findOne({ currentPropertyId: new ObjectId(propertyId) })
  return doc ? toTenant(doc) : null
}

/** Ids of every property a tenant currently lives in (occupied homes). */
export async function listOccupiedPropertyIds(): Promise<Set<string>> {
  const col = await tenantsCollection()
  const ids = await col.distinct('currentPropertyId', { currentPropertyId: { $exists: true } })
  return new Set(ids.filter(Boolean).map((id) => String(id)))
}

/** True if a tenant is placed at this property with active rent billing (i.e. rented). */
export async function isPropertyRented(propertyId: string): Promise<boolean> {
  if (!ObjectId.isValid(propertyId)) return false
  const col = await tenantsCollection()
  const doc = await col.findOne({
    currentPropertyId: new ObjectId(propertyId),
    'billing.status': 'active',
  })
  return doc !== null
}

export async function attachStripeCustomer(
  userId: string,
  customerId: string,
  defaultPaymentMethodId?: string,
): Promise<void> {
  const col = await tenantsCollection()
  const set: Record<string, unknown> = { stripeCustomerId: customerId, updatedAt: new Date() }
  // Imported customers bring their saved payment method, so rent can draft
  // without the in-app fee checkout (which is what normally saves the method).
  if (defaultPaymentMethodId) set.defaultPaymentMethodId = defaultPaymentMethodId
  await col.updateOne({ userId: new ObjectId(userId) }, { $set: set })
}

/** Find the tenant already linked to a Stripe customer (guards double-linking on import). */
export async function getTenantByStripeCustomer(customerId: string): Promise<Tenant | null> {
  const col = await tenantsCollection()
  const doc = await col.findOne({ stripeCustomerId: customerId })
  return doc ? toTenant(doc) : null
}

export async function setFeeSession(userId: string, sessionId: string): Promise<void> {
  const col = await tenantsCollection()
  await col.updateOne(
    { userId: new ObjectId(userId) },
    { $set: { 'fee.stripeSessionId': sessionId, updatedAt: new Date() } },
  )
}

/** Finalize the fee from a completed Checkout session (used by completion page + webhook). Idempotent. */
export async function applyFeeResult(
  sessionId: string,
  result: { status: FeeStatus; paymentIntentId?: string; paymentMethodId?: string },
): Promise<boolean> {
  const col = await tenantsCollection()
  const set: Record<string, unknown> = { 'fee.status': result.status, updatedAt: new Date() }
  if (result.paymentIntentId) set['fee.paymentIntentId'] = result.paymentIntentId
  if (result.status === 'paid') set['fee.paidAt'] = new Date()
  if (result.paymentMethodId) set['defaultPaymentMethodId'] = result.paymentMethodId
  const res = await col.updateOne({ 'fee.stripeSessionId': sessionId }, { $set: set })
  return res.matchedCount === 1
}

// ---- Plaid / verification ----

export async function setPlaidUserToken(userId: string, userToken: string, plaidUserId?: string): Promise<void> {
  const col = await tenantsCollection()
  const set: Record<string, unknown> = { plaidUserToken: userToken, updatedAt: new Date() }
  if (plaidUserId) set.plaidUserId = plaidUserId
  await col.updateOne({ userId: new ObjectId(userId) }, { $set: set })
}

export async function savePlaidVerification(
  userId: string,
  input: {
    accessTokenEnc: string
    itemId: string
    verifiedMonthlyIncome: number | null
    verifiedWeeklyHours?: number | null
    lastPayDate?: string | null
  },
): Promise<void> {
  const col = await tenantsCollection()
  // Always persist the connection (the access token/item lets the webhook + cron
  // read income later, including async payroll/bank-income that isn't ready yet).
  const set: Record<string, unknown> = {
    plaidAccessTokenEnc: input.accessTokenEnc,
    plaidItemId: input.itemId,
    'employment.verificationMethod': 'plaid',
    updatedAt: new Date(),
  }
  // "Verified" means income was actually found — a bank/payroll connection that
  // returns nothing stays unverified (income may still arrive via webhook, or the
  // tenant uses the bank fallback / paystub). See setVerifiedIncome for the async path.
  if (input.verifiedMonthlyIncome !== null) {
    set['employment.verified'] = true
    set['employment.verifiedAt'] = new Date()
    set['employment.verifiedMonthlyIncome'] = input.verifiedMonthlyIncome
    if (input.verifiedWeeklyHours != null) set['employment.verifiedWeeklyHours'] = input.verifiedWeeklyHours
    if (input.lastPayDate) set['employment.lastPayDate'] = input.lastPayDate
  }
  await col.updateOne({ userId: new ObjectId(userId) }, { $set: set })
}

/** Set the tenant's employment type (self-employed toggle + claimed hourly rate). */
export async function setEmploymentType(
  userId: string,
  input: { selfEmployed: boolean; claimedHourlyRate?: number },
): Promise<void> {
  const col = await tenantsCollection()
  const set: Record<string, unknown> = { 'employment.selfEmployed': input.selfEmployed, updatedAt: new Date() }
  const unset: Record<string, unknown> = {}
  if (input.selfEmployed && input.claimedHourlyRate != null) set['employment.claimedHourlyRate'] = input.claimedHourlyRate
  if (!input.selfEmployed) unset['employment.claimedHourlyRate'] = ''
  const update: Record<string, unknown> = { $set: set }
  if (Object.keys(unset).length) update.$unset = unset
  await col.updateOne({ userId: new ObjectId(userId) }, update)
}

/** Set the same employment type by tenant application id (admin override). */
export async function setEmploymentTypeById(
  tenantId: string,
  input: { selfEmployed: boolean; claimedHourlyRate?: number },
): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await tenantsCollection()
  const set: Record<string, unknown> = { 'employment.selfEmployed': input.selfEmployed, updatedAt: new Date() }
  const unset: Record<string, unknown> = {}
  if (input.selfEmployed && input.claimedHourlyRate != null) set['employment.claimedHourlyRate'] = input.claimedHourlyRate
  if (!input.selfEmployed) unset['employment.claimedHourlyRate'] = ''
  const update: Record<string, unknown> = { $set: set }
  if (Object.keys(unset).length) update.$unset = unset
  await col.updateOne({ _id: new ObjectId(tenantId) }, update)
}

/** Increment and return the tenant's Plaid link counter (bank-link velocity monitoring). */
export async function recordPlaidLink(userId: string): Promise<number> {
  const col = await tenantsCollection()
  const doc = await col.findOneAndUpdate(
    { userId: new ObjectId(userId) },
    { $inc: { plaidLinkCount: 1 }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' },
  )
  return doc?.plaidLinkCount ?? 1
}

/** Flag a tenant for manual security review (review queue). */
export async function flagTenantForReview(userId: string, reason: string): Promise<void> {
  const col = await tenantsCollection()
  await col.updateOne(
    { userId: new ObjectId(userId) },
    { $set: { flaggedForReview: true, reviewReason: reason, flaggedAt: new Date(), updatedAt: new Date() } },
  )
}

/**
 * Record that an admin stored a paystub for this tenant (file is in lib/paystubs.ts).
 * Does NOT mark income verified — the admin still enters the verified figures
 * with the manual income form after reviewing it. Clears any legacy public URL.
 */
export async function recordPaystubUpload(
  tenantId: string,
  meta: { contentType: string; uploadedAt: Date },
): Promise<boolean> {
  if (!ObjectId.isValid(tenantId)) return false
  const col = await tenantsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(tenantId) },
    { $set: { paystub: { contentType: meta.contentType, uploadedAt: meta.uploadedAt }, updatedAt: new Date() } },
  )
  return res.matchedCount === 1
}

/** Look up a tenant by their Plaid item id (item-based income webhooks). */
export async function getTenantByPlaidItem(itemId: string): Promise<Tenant | null> {
  const col = await tenantsCollection()
  const doc = await col.findOne({ plaidItemId: itemId })
  return doc ? toTenant(doc) : null
}

/** Look up a tenant by their Plaid user_id (user-based income webhooks, e.g. bank-income refresh). */
export async function getTenantByPlaidUserId(plaidUserId: string): Promise<Tenant | null> {
  const col = await tenantsCollection()
  const doc = await col.findOne({ plaidUserId })
  return doc ? toTenant(doc) : null
}

/**
 * Mark income verified + refresh the verified figures for a tenant (by application id).
 * No-op when no income was found: "verified" must mean we actually have income on
 * file. Callers handle the empty case (flag for review + alert) — we never mark
 * verified, nor downgrade an existing verification, on a null reading.
 */
export async function setVerifiedIncome(
  tenantId: string,
  input: { monthlyIncome: number | null; weeklyHours?: number | null; lastPayDate?: string | null },
): Promise<void> {
  if (!ObjectId.isValid(tenantId) || input.monthlyIncome === null) return
  const col = await tenantsCollection()
  const set: Record<string, unknown> = {
    'employment.verified': true,
    'employment.verificationMethod': 'plaid',
    'employment.verifiedAt': new Date(),
    'employment.verifiedMonthlyIncome': input.monthlyIncome,
    updatedAt: new Date(),
  }
  if (input.weeklyHours != null) set['employment.verifiedWeeklyHours'] = input.weeklyHours
  if (input.lastPayDate) set['employment.lastPayDate'] = input.lastPayDate
  await col.updateOne({ _id: new ObjectId(tenantId) }, { $set: set })
}

/**
 * Admin manually verifies income (reviewed paystub, employer call, …) and
 * records the confirmed figures — the same fields Plaid verification sets, so
 * rent setup, the program-rate suggestion, and the 35-hour check all work unchanged.
 * Distinguishable from Plaid via verificationMethod: 'manual'.
 */
export async function setVerifiedIncomeManually(
  tenantId: string,
  input: { monthlyIncome: number; weeklyHours: number },
): Promise<boolean> {
  if (!ObjectId.isValid(tenantId)) return false
  const col = await tenantsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(tenantId) },
    {
      $set: {
        'employment.verified': true,
        'employment.verificationMethod': 'manual',
        'employment.verifiedAt': new Date(),
        'employment.verifiedMonthlyIncome': input.monthlyIncome,
        'employment.verifiedWeeklyHours': input.weeklyHours,
        updatedAt: new Date(),
      },
    },
  )
  return res.matchedCount === 1
}

export async function setBilling(userId: string, billing: Billing): Promise<void> {
  const col = await tenantsCollection()
  await col.updateOne({ userId: new ObjectId(userId) }, { $set: { billing, updatedAt: new Date() } })
}

/** Remove a tenant's billing record (e.g. when replacing an imported subscription). */
export async function clearBilling(tenantId: string): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await tenantsCollection()
  await col.updateOne({ _id: new ObjectId(tenantId) }, { $set: { updatedAt: new Date() }, $unset: { billing: '' } })
}

/**
 * Save new rent terms after Stripe accepted the change, and append the audit
 * entry. Clears `imported`: once the app has re-priced it, the app manages it.
 * `split` is replaced (or removed for rent-only programs).
 */
export async function updateBillingTerms(
  tenantId: string,
  terms: {
    baseAmountCents: number
    amountCents: number
    frequency: BillingFrequency
    nextDraftAt: Date
    split?: { rentCents: number; carCents: number }
  },
  change: BillingChange,
): Promise<boolean> {
  if (!ObjectId.isValid(tenantId)) return false
  const col = await tenantsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(tenantId), billing: { $exists: true } },
    {
      $set: {
        'billing.baseAmountCents': terms.baseAmountCents,
        'billing.amountCents': terms.amountCents,
        'billing.frequency': terms.frequency,
        'billing.nextDraftAt': terms.nextDraftAt,
        ...(terms.split ? { 'billing.split': terms.split } : {}),
        updatedAt: new Date(),
      },
      $unset: { 'billing.imported': '', ...(terms.split ? {} : { 'billing.split': '' }) },
      $push: { billingHistory: change },
    },
  )
  return res.matchedCount === 1
}

/**
 * Replace a CANCELED billing record with a new subscription, archiving the old
 * one in `previousBillings`. Atomic: matches only while billing is still
 * 'canceled', so two concurrent restarts can't both win. False if not matched.
 */
export async function restartBilling(tenantId: string, billing: Billing): Promise<boolean> {
  if (!ObjectId.isValid(tenantId)) return false
  const col = await tenantsCollection()
  const res = await col.updateOne({ _id: new ObjectId(tenantId), 'billing.status': 'canceled' }, [
    {
      // Pipeline update so the CURRENT billing value can be appended to the archive.
      $set: {
        previousBillings: { $concatArrays: [{ $ifNull: ['$previousBillings', []] }, ['$billing']] },
      },
    },
    { $set: { billing: { $literal: billing }, updatedAt: new Date() } },
  ])
  return res.matchedCount === 1
}

/**
 * Admin "Stripe link": set the tenant's Stripe customer and saved payment
 * method (validated against Stripe by the caller). A null payment method
 * CLEARS the stored one, so a method from a previous customer never lingers.
 */
export async function linkStripeCustomer(
  tenantId: string,
  customerId: string,
  paymentMethodId: string | null,
): Promise<boolean> {
  if (!ObjectId.isValid(tenantId)) return false
  const col = await tenantsCollection()
  const update = paymentMethodId
    ? { $set: { stripeCustomerId: customerId, defaultPaymentMethodId: paymentMethodId, updatedAt: new Date() } }
    : {
        $set: { stripeCustomerId: customerId, updatedAt: new Date() },
        $unset: { defaultPaymentMethodId: '' as const },
      }
  const res = await col.updateOne({ _id: new ObjectId(tenantId) }, update)
  return res.matchedCount === 1
}

/**
 * Admin pause (after Stripe accepted it). Only from a live, unpaused state.
 * Returns false if the tenant wasn't in a pausable state.
 */
export async function pauseBillingByAdmin(
  tenantId: string,
  pause: { reason?: string; resumesAt?: Date },
): Promise<boolean> {
  if (!ObjectId.isValid(tenantId)) return false
  const col = await tenantsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(tenantId), 'billing.status': { $in: ['active', 'past_due'] } },
    {
      $set: {
        'billing.status': 'paused',
        'billing.pause': { at: new Date(), source: 'admin', ...pause },
        updatedAt: new Date(),
      },
    },
  )
  return res.matchedCount === 1
}

/** Admin resume of an ADMIN pause (after Stripe accepted it). */
export async function resumeBillingByAdmin(tenantId: string): Promise<boolean> {
  if (!ObjectId.isValid(tenantId)) return false
  const col = await tenantsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(tenantId), 'billing.status': 'paused' },
    { $set: { 'billing.status': 'active', updatedAt: new Date() }, $unset: { 'billing.pause': '' } },
  )
  return res.matchedCount === 1
}

/**
 * Webhook sync (customer.subscription.updated): Stripe is the source of truth
 * for pause state. Paused in Stripe → 'paused' here (recording a dashboard
 * pause if we didn't start it). Not paused in Stripe but paused here (auto-
 * resume date reached, or unpaused in the dashboard) → take Stripe's status.
 * Income-review flags are left in place for the admin to clear.
 */
export async function syncPauseFromStripe(
  subscriptionId: string,
  stripePaused: { resumesAt?: Date } | null,
  status: BillingStatus,
): Promise<void> {
  const col = await tenantsCollection()
  const now = new Date()
  if (stripePaused) {
    await col.updateOne(
      { 'billing.stripeSubscriptionId': subscriptionId, 'billing.status': { $ne: 'paused' } },
      {
        $set: {
          'billing.status': 'paused',
          'billing.pause': { at: now, source: 'admin', reason: 'Paused in Stripe', ...stripePaused },
          updatedAt: now,
        },
      },
    )
    return
  }
  await col.updateOne(
    { 'billing.stripeSubscriptionId': subscriptionId, 'billing.status': 'paused' },
    { $set: { 'billing.status': status, updatedAt: now }, $unset: { 'billing.pause': '' } },
  )
}

/** Append an alternative-payment credit (already applied in Stripe) to the tenant's audit log. Idempotent. */
export async function recordRentCredit(tenantId: string, credit: RentCredit): Promise<boolean> {
  if (!ObjectId.isValid(tenantId)) return false
  const col = await tenantsCollection()
  // Skip if this Stripe transaction is already logged (a retried submit replays
  // the same idempotent Stripe response, so it must not add a second entry).
  const res = await col.updateOne(
    { _id: new ObjectId(tenantId), 'rentCredits.stripeTransactionId': { $ne: credit.stripeTransactionId } },
    { $push: { rentCredits: credit }, $set: { updatedAt: new Date() } },
  )
  return res.matchedCount === 1
}

/** Update rent billing status from a Stripe webhook. Never clobbers a manual 'paused' (job-loss) state. */
export async function setBillingStatusBySubscription(subscriptionId: string, status: BillingStatus): Promise<void> {
  const col = await tenantsCollection()
  await col.updateOne(
    { 'billing.stripeSubscriptionId': subscriptionId, 'billing.status': { $ne: 'paused' } },
    { $set: { 'billing.status': status, updatedAt: new Date() } },
  )
}

// ---- Monthly income / job-loss check ----

/** Set when the next monthly income re-check should run (by application id). */
export async function setNextIncomeCheck(tenantId: string, at: Date): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await tenantsCollection()
  await col.updateOne({ _id: new ObjectId(tenantId) }, { $set: { nextIncomeCheckAt: at, updatedAt: new Date() } })
}

/** Tenants whose rent is active and whose monthly income re-check is due. */
export async function listTenantsDueForIncomeCheck(now: Date): Promise<Tenant[]> {
  const col = await tenantsCollection()
  const docs = await col
    .find({ 'billing.status': 'active', nextIncomeCheckAt: { $lte: now }, plaidUserToken: { $exists: true } })
    .toArray()
  return docs.map(toTenant)
}

/** Pause rent for review (job loss / income not found). Stripe pause happens in the caller. */
export async function pauseBillingForReview(tenantId: string, reason: string): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await tenantsCollection()
  await col.updateOne(
    { _id: new ObjectId(tenantId) },
    {
      $set: {
        'billing.status': 'paused',
        'billing.pause': { at: new Date(), source: 'income_check', reason },
        flaggedForReview: true,
        reviewReason: reason,
        flaggedAt: new Date(),
        updatedAt: new Date(),
      },
    },
  )
}

/** Resume rent after an admin reconfirms income. Clears the review flag and reschedules the next check. */
export async function resumeBilling(tenantId: string, nextCheckAt: Date): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await tenantsCollection()
  await col.updateOne(
    { _id: new ObjectId(tenantId) },
    {
      $set: { 'billing.status': 'active', nextIncomeCheckAt: nextCheckAt, updatedAt: new Date() },
      $unset: { flaggedForReview: '', reviewReason: '', flaggedAt: '', 'billing.pause': '' },
    },
  )
}

export async function setIdentitySession(userId: string, sessionId: string): Promise<void> {
  const col = await tenantsCollection()
  await col.updateOne(
    { userId: new ObjectId(userId) },
    { $set: { stripeIdentitySessionId: sessionId, updatedAt: new Date() } },
  )
}

/**
 * Persist a verified identity result. Located by userId (from Stripe metadata)
 * when available, otherwise by the verification session id (webhook fallback).
 */
export async function markIdentityVerified(opts: {
  userId?: string
  sessionId?: string
  last4?: string
}): Promise<void> {
  const col = await tenantsCollection()
  const filter =
    opts.userId && ObjectId.isValid(opts.userId)
      ? { userId: new ObjectId(opts.userId) }
      : opts.sessionId
        ? { stripeIdentitySessionId: opts.sessionId }
        : null
  if (!filter) return
  const set: Record<string, unknown> = {
    identityVerified: true,
    identityVerifiedAt: new Date(),
    updatedAt: new Date(),
  }
  if (opts.last4) set.idNumberLast4 = opts.last4
  await col.updateOne(filter, { $set: set })
}

// ---- Admin ----

/**
 * Admin attestation that they verified the tenant's government ID themselves
 * (in person / from a paper application) instead of via Stripe Identity. Kept
 * distinguishable with `identityManual` for the audit trail. Unblocks approval.
 */
export async function markIdentityVerifiedManually(tenantId: string): Promise<boolean> {
  if (!ObjectId.isValid(tenantId)) return false
  const col = await tenantsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(tenantId), identityVerified: { $ne: true } },
    { $set: { identityVerified: true, identityManual: true, identityVerifiedAt: new Date(), updatedAt: new Date() } },
  )
  return res.matchedCount === 1
}

/**
 * Mark the application fee as collected outside the app (cash, or already paid
 * on the Stripe side for imported tenants). Never downgrades a real payment —
 * only applies while the fee isn't already paid. Unblocks approval.
 */
export async function markFeeCollectedOffline(tenantId: string): Promise<boolean> {
  if (!ObjectId.isValid(tenantId)) return false
  const col = await tenantsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(tenantId), 'fee.status': { $ne: 'paid' } },
    { $set: { 'fee.status': 'paid', 'fee.offline': true, 'fee.paidAt': new Date(), updatedAt: new Date() } },
  )
  return res.matchedCount === 1
}

/**
 * Admin reset for stuck applicants: wipe ALL verification progress — Plaid
 * (tokens, item, link counter), income results, Stripe Identity, paystub, and
 * security flags — so the tenant can re-enter info and run verification fresh.
 * Application details, the paid fee, the saved payment method, and the
 * application status are deliberately kept.
 *
 * The filter requires that no billing record exists: the monthly job-loss check
 * reads income through the Plaid connection, so resetting under an active rent
 * subscription would silently exempt the tenant from it. Matching in the filter
 * (not just a pre-check in the caller) makes the guard atomic against a
 * concurrent rent setup. Returns false when blocked or not found.
 */
export async function resetVerification(tenantId: string): Promise<boolean> {
  if (!ObjectId.isValid(tenantId)) return false
  const col = await tenantsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(tenantId), billing: { $exists: false } },
    {
      $set: { updatedAt: new Date() },
      $unset: {
        plaidUserToken: '',
        plaidUserId: '',
        plaidAccessTokenEnc: '',
        plaidItemId: '',
        plaidLinkCount: '',
        'employment.verified': '',
        'employment.verificationMethod': '',
        'employment.verifiedMonthlyIncome': '',
        'employment.verifiedWeeklyHours': '',
        'employment.lastPayDate': '',
        'employment.verifiedAt': '',
        stripeIdentitySessionId: '',
        identityVerified: '',
        identityVerifiedAt: '',
        identityManual: '',
        idNumberLast4: '',
        paystub: '',
        flaggedForReview: '',
        reviewReason: '',
        flaggedAt: '',
        nextIncomeCheckAt: '',
      },
    },
  )
  // Verification restarts from scratch, so the stored paystub goes too.
  if (res.matchedCount === 1) await deletePaystubFile(tenantId)
  return res.matchedCount === 1
}

export async function listTenants(): Promise<Tenant[]> {
  const col = await tenantsCollection()
  const docs = await col.find({}).sort({ createdAt: -1 }).toArray()
  return docs.map(toTenant)
}

export async function approveTenant(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await tenantsCollection()
  // New approved tenants start at tier 0 unless already placed.
  const existing = await col.findOne({ _id: new ObjectId(id) })
  const res = await col.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: 'approved',
        currentTier: existing?.currentTier ?? 0,
        approvedAt: new Date(),
        updatedAt: new Date(),
      },
      $unset: { rejectionReason: '' },
    },
  )
  return res.matchedCount === 1
}

/**
 * Record an approved move-in: place the tenant at the property's tier and set
 * their mailing address to the new home. The address is sticky — it stays until
 * the tenant is approved into another property.
 */
export async function placeTenant(
  tenantId: string,
  propertyId: string,
  tier: number,
  address: Address,
): Promise<boolean> {
  if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(propertyId)) return false
  const col = await tenantsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(tenantId) },
    { $set: { currentPropertyId: new ObjectId(propertyId), currentTier: tier, address, updatedAt: new Date() } },
  )
  return res.matchedCount === 1
}

/**
 * Reverse/evict the tenant's current placement at `propertyId`: release them
 * from the property. The address stays as-is (it only changes on a new move-in).
 * No-op if the tenant isn't currently placed at that property, so reversing an
 * older decided request can't release a newer placement.
 */
export async function unplaceTenant(tenantId: string, propertyId: string): Promise<boolean> {
  if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(propertyId)) return false
  const col = await tenantsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(tenantId), currentPropertyId: new ObjectId(propertyId) },
    { $set: { updatedAt: new Date() }, $unset: { currentPropertyId: '' } },
  )
  return res.matchedCount === 1
}

export async function rejectTenant(id: string, reason: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await tenantsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: 'rejected', rejectionReason: reason, updatedAt: new Date() } },
  )
  return res.matchedCount === 1
}
