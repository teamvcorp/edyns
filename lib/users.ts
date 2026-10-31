import 'server-only'

import { ObjectId, type Collection } from 'mongodb'
import { randomBytes } from 'node:crypto'
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
  /**
   * Set when an admin issues a temporary password (welcome / welcome-back email).
   * The user is forced to choose a new password before they can use their portal.
   */
  mustResetPassword?: boolean
  /**
   * Bumped whenever the password changes (self-service or admin reset). Each
   * session cookie carries the version it was issued with; the DAL rejects
   * cookies whose version no longer matches, so a password change signs out
   * every other device. Missing = 0 (accounts created before this field).
   */
  sessionVersion?: number
  createdAt: Date
}

export type PayoutFrequency = 'manual' | 'daily' | 'weekly' | 'monthly'

export type PublicUser = {
  id: string
  email: string
  name: string
  role: Exclude<Role, 'admin'>
}

// Index creation is idempotent but costs a round trip, so run it once per
// server instance rather than on every query (the DAL now reads users per request).
let indexesReady: Promise<unknown> | undefined

async function usersCollection(): Promise<Collection<UserDoc>> {
  const db = await getDb()
  const col = db.collection<UserDoc>('users')
  indexesReady ??= Promise.all([
    // Unique email per role.
    col.createIndex({ email: 1, role: 1 }, { unique: true }),
    // Webhook lookups: which partner owns a Stripe Connect account (sparse — tenants have none).
    col.createIndex({ stripeAccountId: 1 }, { sparse: true }),
  ]).catch((err) => {
    indexesReady = undefined // retry on the next call
    throw err
  })
  await indexesReady
  return col
}

/**
 * Minimal per-request auth state for the DAL: does the account still exist,
 * which session version is current, and is a password reset pending?
 * Returns null if the user was deleted (their cookie must stop working).
 */
export async function getSessionState(
  userId: string,
): Promise<{ sessionVersion: number; mustReset: boolean } | null> {
  if (!ObjectId.isValid(userId)) return null
  const col = await usersCollection()
  const doc = await col.findOne(
    { _id: new ObjectId(userId) },
    { projection: { sessionVersion: 1, mustResetPassword: 1 } },
  )
  if (!doc) return null
  return { sessionVersion: doc.sessionVersion ?? 0, mustReset: Boolean(doc.mustResetPassword) }
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

/** The partner who owns a Stripe Connect account (webhook transfer routing). */
export async function findPartnerByStripeAccountId(accountId: string): Promise<PartnerProfile | null> {
  if (!accountId.startsWith('acct_')) return null
  const col = await usersCollection()
  const doc = await col.findOne({ stripeAccountId: accountId, role: 'partner' })
  return doc ? toPartnerProfile(doc) : null
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
): Promise<(PublicUser & { mustReset: boolean; sessionVersion: number }) | null> {
  const user = await findUserByEmail(email, role)
  const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv'
  const ok = await bcrypt.compare(password, hash)
  if (!ok || !user) return null
  return { ...toPublicUser(user), mustReset: Boolean(user.mustResetPassword), sessionVersion: user.sessionVersion ?? 0 }
}

/** A short, URL-safe temporary password (~12 chars) for admin-issued resets. */
function generateTempPassword(): string {
  return randomBytes(9).toString('base64url')
}

/**
 * Issue a fresh temporary password for a user (by user id) and require them to
 * reset it on next sign-in. Returns the details needed to email the temp password,
 * or null if the user doesn't exist.
 */
export async function resetUserPassword(
  userId: string,
): Promise<{ email: string; name: string; role: Exclude<Role, 'admin'>; tempPassword: string } | null> {
  if (!ObjectId.isValid(userId)) return null
  const col = await usersCollection()
  const user = await col.findOne({ _id: new ObjectId(userId) })
  if (!user) return null
  const tempPassword = generateTempPassword()
  const passwordHash = await bcrypt.hash(tempPassword, 10)
  // $inc sessionVersion: any session issued before this reset stops working.
  await col.updateOne(
    { _id: user._id },
    { $set: { passwordHash, mustResetPassword: true }, $inc: { sessionVersion: 1 } },
  )
  return { email: user.email, name: user.name, role: user.role, tempPassword }
}

/**
 * Set a user's password (their own choice) and clear the force-reset flag.
 * Bumps sessionVersion (signing out every other device) and returns the new
 * version so the caller can reissue THIS device's session with it; null on failure.
 */
export async function setUserPassword(userId: string, newPassword: string): Promise<number | null> {
  if (!ObjectId.isValid(userId)) return null
  const col = await usersCollection()
  const passwordHash = await bcrypt.hash(newPassword, 10)
  const doc = await col.findOneAndUpdate(
    { _id: new ObjectId(userId) },
    { $set: { passwordHash }, $unset: { mustResetPassword: '' }, $inc: { sessionVersion: 1 } },
    { returnDocument: 'after', projection: { sessionVersion: 1 } },
  )
  return doc ? (doc.sessionVersion ?? 0) : null
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
