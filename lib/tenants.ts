import 'server-only'

import { ObjectId, type Collection } from 'mongodb'
import { getDb } from './mongodb'
import type { Address } from './users'

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
  /** Set once income is confirmed (bank connected through Plaid). */
  verified?: boolean
  /** How income was evidenced: Plaid bank connection or a manually uploaded paystub. */
  verificationMethod?: VerificationMethod
  /** Monthly income derived from Plaid Bank Income, when available. */
  verifiedMonthlyIncome?: number
  verifiedAt?: Date
}

export type BillingStatus = 'none' | 'active' | 'past_due' | 'canceled'
export type BillingFrequency = 'weekly' | 'biweekly' | 'monthly'

export interface Billing {
  /** Per-draft charge in cents (the 40% grossed up so the tenant covers Stripe's fee). */
  amountCents: number
  /** The base 40% amount (before processing fee) the admin entered, in cents. */
  baseAmountCents: number
  /** How often rent drafts. */
  frequency: BillingFrequency
  stripeSubscriptionId: string
  status: BillingStatus
  /** When the first draft occurs (Stripe trial_end / billing anchor). */
  firstDraftAt: Date
  startedAt: Date
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected'
export type FeeStatus = 'unpaid' | 'processing' | 'paid'

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
  status: ApplicationStatus
  rejectionReason?: string
  fee: {
    status: FeeStatus
    amountCents: number
    stripeSessionId?: string
    paymentIntentId?: string
    paidAt?: Date
  }
  stripeCustomerId?: string
  defaultPaymentMethodId?: string
  /** Plaid: user token + encrypted access token for income verification. */
  plaidUserToken?: string
  plaidAccessTokenEnc?: string
  plaidItemId?: string
  /** Stripe Identity (government ID + selfie). Full ID never stored — only last 4. */
  stripeIdentitySessionId?: string
  identityVerified?: boolean
  identityVerifiedAt?: Date
  idNumberLast4?: string
  /** Manually uploaded paystub — alternative to Plaid for income verification. */
  paystub?: { url: string; uploadedAt: Date }
  /** Recurring rent collection (40% of income) via Stripe. */
  billing?: Billing
  /** Tenants start at tier 0 on approval and move up as they relocate. */
  currentTier?: number
  currentPropertyId?: ObjectId
  createdAt: Date
  updatedAt: Date
  approvedAt?: Date
}

export type Tenant = Omit<TenantDoc, '_id' | 'userId' | 'currentPropertyId'> & {
  id: string
  userId: string
  currentPropertyId?: string
}

async function tenantsCollection(): Promise<Collection<TenantDoc>> {
  const db = await getDb()
  const col = db.collection<TenantDoc>('tenants')
  await col.createIndex({ userId: 1 }, { unique: true })
  await col.createIndex({ status: 1 })
  await col.createIndex({ 'fee.stripeSessionId': 1 })
  await col.createIndex({ 'billing.stripeSubscriptionId': 1 })
  return col
}

function toTenant(doc: TenantDoc): Tenant {
  const { _id, userId, currentPropertyId, ...rest } = doc
  return {
    ...rest,
    id: _id.toString(),
    userId: userId.toString(),
    currentPropertyId: currentPropertyId?.toString(),
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
    status: 'pending',
    fee: { status: 'unpaid', amountCents: input.feeAmountCents },
    createdAt: now,
    updatedAt: now,
  }
  await col.insertOne(doc)
  return toTenant(doc)
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

export async function attachStripeCustomer(userId: string, customerId: string): Promise<void> {
  const col = await tenantsCollection()
  await col.updateOne({ userId: new ObjectId(userId) }, { $set: { stripeCustomerId: customerId, updatedAt: new Date() } })
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

export async function setPlaidUserToken(userId: string, userToken: string): Promise<void> {
  const col = await tenantsCollection()
  await col.updateOne({ userId: new ObjectId(userId) }, { $set: { plaidUserToken: userToken, updatedAt: new Date() } })
}

export async function savePlaidVerification(
  userId: string,
  input: { accessTokenEnc: string; itemId: string; verifiedMonthlyIncome: number | null },
): Promise<void> {
  const col = await tenantsCollection()
  const set: Record<string, unknown> = {
    plaidAccessTokenEnc: input.accessTokenEnc,
    plaidItemId: input.itemId,
    'employment.verified': true,
    'employment.verificationMethod': 'plaid',
    'employment.verifiedAt': new Date(),
    updatedAt: new Date(),
  }
  if (input.verifiedMonthlyIncome !== null) set['employment.verifiedMonthlyIncome'] = input.verifiedMonthlyIncome
  await col.updateOne({ userId: new ObjectId(userId) }, { $set: set })
}

/** Save a manually uploaded paystub (alternative to Plaid). Income is confirmed by the admin. */
export async function setPaystub(userId: string, url: string): Promise<void> {
  const col = await tenantsCollection()
  await col.updateOne(
    { userId: new ObjectId(userId) },
    {
      $set: {
        paystub: { url, uploadedAt: new Date() },
        'employment.verificationMethod': 'manual',
        updatedAt: new Date(),
      },
    },
  )
}

export async function setBilling(userId: string, billing: Billing): Promise<void> {
  const col = await tenantsCollection()
  await col.updateOne({ userId: new ObjectId(userId) }, { $set: { billing, updatedAt: new Date() } })
}

/** Update rent billing status from a Stripe subscription/invoice webhook. */
export async function setBillingStatusBySubscription(subscriptionId: string, status: BillingStatus): Promise<void> {
  const col = await tenantsCollection()
  await col.updateOne(
    { 'billing.stripeSubscriptionId': subscriptionId },
    { $set: { 'billing.status': status, updatedAt: new Date() } },
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

/** Record an approved move-in: place the tenant at the property's tier. */
export async function placeTenant(tenantId: string, propertyId: string, tier: number): Promise<boolean> {
  if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(propertyId)) return false
  const col = await tenantsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(tenantId) },
    { $set: { currentPropertyId: new ObjectId(propertyId), currentTier: tier, updatedAt: new Date() } },
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
