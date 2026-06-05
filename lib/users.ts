import 'server-only'

import { ObjectId, type Collection } from 'mongodb'
import bcrypt from 'bcryptjs'
import { getDb } from './mongodb'
import { encryptString } from './crypto'
import type { Role } from './session'

export interface Address {
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
}

/**
 * User records for the two credential-based audiences (property partners and
 * tenants). The admin is gated by a shared password and has no user record.
 *
 * Partner enrollment adds a profile (phone, billing address) and a tax ID,
 * which is stored encrypted at rest — only `taxIdLast4` is kept in the clear.
 */
export interface UserDoc {
  _id: ObjectId
  email: string
  name: string
  passwordHash: string
  role: Exclude<Role, 'admin'>
  phone?: string
  billingAddress?: Address
  taxIdEnc?: string
  taxIdLast4?: string
  /** Stripe Connect connected-account id (acct_...) for equity payouts. */
  stripeAccountId?: string
  /** How often Stripe pays the connected account's balance out to their bank. */
  payoutFrequency?: PayoutFrequency
  createdAt: Date
}

export type PayoutFrequency = 'manual' | 'daily' | 'weekly' | 'monthly'

export type PublicUser = {
  id: string
  email: string
  name: string
  role: Exclude<Role, 'admin'>
}

async function usersCollection(): Promise<Collection<UserDoc>> {
  const db = await getDb()
  const col = db.collection<UserDoc>('users')
  // Idempotent: ensures unique email per role on first use.
  await col.createIndex({ email: 1, role: 1 }, { unique: true })
  return col
}

function toPublicUser(doc: UserDoc): PublicUser {
  return { id: doc._id.toString(), email: doc.email, name: doc.name, role: doc.role }
}

export async function findUserByEmail(email: string, role: Exclude<Role, 'admin'>): Promise<UserDoc | null> {
  const col = await usersCollection()
  return col.findOne({ email: email.toLowerCase().trim(), role })
}

export async function isEmailTaken(email: string, role: Exclude<Role, 'admin'>): Promise<boolean> {
  return (await findUserByEmail(email, role)) !== null
}

export type PartnerProfile = PublicUser & {
  phone?: string
  billingAddress?: Address
  taxIdLast4?: string
  stripeAccountId?: string
  payoutFrequency?: PayoutFrequency
}

function toPartnerProfile(doc: UserDoc): PartnerProfile {
  return {
    ...toPublicUser(doc),
    phone: doc.phone,
    billingAddress: doc.billingAddress,
    taxIdLast4: doc.taxIdLast4,
    stripeAccountId: doc.stripeAccountId,
    payoutFrequency: doc.payoutFrequency,
  }
}

export async function setStripeAccountId(userId: string, accountId: string): Promise<void> {
  if (!ObjectId.isValid(userId)) return
  const col = await usersCollection()
  await col.updateOne({ _id: new ObjectId(userId), role: 'partner' }, { $set: { stripeAccountId: accountId } })
}

export async function setPayoutFrequency(userId: string, frequency: PayoutFrequency): Promise<void> {
  if (!ObjectId.isValid(userId)) return
  const col = await usersCollection()
  await col.updateOne({ _id: new ObjectId(userId), role: 'partner' }, { $set: { payoutFrequency: frequency } })
}

/** Safe partner profile by id — never returns the password hash or tax ID ciphertext. */
export async function findPartnerById(id: string): Promise<PartnerProfile | null> {
  if (!ObjectId.isValid(id)) return null
  const col = await usersCollection()
  const doc = await col.findOne({ _id: new ObjectId(id), role: 'partner' })
  if (!doc) return null
  return toPartnerProfile(doc)
}

/** All partner accounts, newest first (admin). */
export async function listPartners(): Promise<PartnerProfile[]> {
  const col = await usersCollection()
  const docs = await col.find({ role: 'partner' }).sort({ createdAt: -1 }).toArray()
  return docs.map(toPartnerProfile)
}

/**
 * Update an editable partner profile (admin). If a new tax ID is supplied it is
 * re-encrypted; otherwise the existing one is left untouched. Enforces email
 * uniqueness among partners.
 */
export async function updatePartner(
  id: string,
  input: { name: string; email: string; phone: string; billingAddress: Address; taxId?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!ObjectId.isValid(id)) return { ok: false, error: 'Invalid id.' }
  const col = await usersCollection()
  const email = input.email.toLowerCase().trim()

  const clash = await col.findOne({ email, role: 'partner', _id: { $ne: new ObjectId(id) } })
  if (clash) return { ok: false, error: 'Another partner already uses this email.' }

  const set: Partial<UserDoc> = {
    name: input.name.trim(),
    email,
    phone: input.phone.trim(),
    billingAddress: input.billingAddress,
  }
  if (input.taxId && input.taxId.trim()) {
    const taxId = input.taxId.trim()
    set.taxIdEnc = encryptString(taxId)
    set.taxIdLast4 = taxId.replace(/\D/g, '').slice(-4)
  }

  const res = await col.updateOne({ _id: new ObjectId(id), role: 'partner' }, { $set: set })
  return res.matchedCount === 1 ? { ok: true } : { ok: false, error: 'Partner not found.' }
}

export async function deletePartner(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await usersCollection()
  const res = await col.deleteOne({ _id: new ObjectId(id), role: 'partner' })
  return res.deletedCount === 1
}

/**
 * Verify email + password for a given role. Returns the public user on success,
 * null otherwise. Performs a hash comparison even when the user is missing to
 * avoid leaking which emails exist via timing.
 */
export async function verifyCredentials(
  email: string,
  password: string,
  role: Exclude<Role, 'admin'>,
): Promise<PublicUser | null> {
  const user = await findUserByEmail(email, role)
  const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv'
  const ok = await bcrypt.compare(password, hash)
  if (!ok || !user) return null
  return toPublicUser(user)
}

export async function createUser(input: {
  email: string
  name: string
  password: string
  role: Exclude<Role, 'admin'>
}): Promise<PublicUser> {
  const col = await usersCollection()
  const passwordHash = await bcrypt.hash(input.password, 10)
  const doc: UserDoc = {
    _id: new ObjectId(),
    email: input.email.toLowerCase().trim(),
    name: input.name.trim(),
    passwordHash,
    role: input.role,
    createdAt: new Date(),
  }
  await col.insertOne(doc)
  return toPublicUser(doc)
}

/**
 * Create a property-partner account from the enrollment form. The tax ID is
 * encrypted at rest; only the last 4 digits are stored in the clear.
 * Throws on a duplicate (email, role) thanks to the unique index.
 */
export async function registerPartner(input: {
  name: string
  email: string
  phone: string
  password: string
  billingAddress: Address
  taxId: string
}): Promise<PublicUser> {
  const col = await usersCollection()
  const passwordHash = await bcrypt.hash(input.password, 10)
  const taxId = input.taxId.trim()
  const doc: UserDoc = {
    _id: new ObjectId(),
    email: input.email.toLowerCase().trim(),
    name: input.name.trim(),
    passwordHash,
    role: 'partner',
    phone: input.phone.trim(),
    billingAddress: input.billingAddress,
    taxIdEnc: encryptString(taxId),
    taxIdLast4: taxId.replace(/\D/g, '').slice(-4),
    createdAt: new Date(),
  }
  await col.insertOne(doc)
  return toPublicUser(doc)
}
