import 'server-only'

import { ObjectId, type Collection } from 'mongodb'
import { createHash, randomBytes } from 'node:crypto'
import { getDb } from './mongodb'

/**
 * Tenant invitations: an admin invites someone (name + email, optionally the
 * property they found us through) and they get an emailed link to the public
 * application form.
 *
 * Security model (mirrors how passwords are treated):
 *  - The emailed token is 32 random bytes. We store ONLY its SHA-256 hash, so a
 *    database leak cannot be turned into working invite links.
 *  - Invites expire (INVITE_TTL_DAYS) and are single-use. Use is claimed
 *    atomically so two concurrent submissions can't both redeem one invite.
 *  - The invited email/name/property live on the server-side record. The form
 *    only carries the opaque token, so none of them can be edited via the URL.
 *
 * The property is a HINT for client reassurance only — it never creates a
 * move-in request (those require an approved tenant; see app/actions/moveins.ts).
 */

export const INVITE_TTL_DAYS = 14

export type InviteStatus = 'sent' | 'used' | 'expired'

export interface TenantInviteDoc {
  _id: ObjectId
  tokenHash: string
  name: string
  /** Lower-cased, trimmed — compared against users.email. */
  email: string
  propertyId?: ObjectId
  createdAt: Date
  expiresAt: Date
  /** How many times the email has been (re)sent. */
  sendCount: number
  usedAt?: Date
  tenantId?: ObjectId
}

export type TenantInvite = {
  id: string
  name: string
  email: string
  propertyId?: string
  createdAt: Date
  expiresAt: Date
  sendCount: number
  usedAt?: Date
  status: InviteStatus
}

async function invitesCollection(): Promise<Collection<TenantInviteDoc>> {
  const db = await getDb()
  const col = db.collection<TenantInviteDoc>('tenantInvites')
  await col.createIndex({ tokenHash: 1 }, { unique: true })
  await col.createIndex({ email: 1 })
  return col
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function newToken(): string {
  return randomBytes(32).toString('base64url')
}

function expiryFromNow(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
}

function toInvite(doc: TenantInviteDoc): TenantInvite {
  const status: InviteStatus = doc.usedAt ? 'used' : doc.expiresAt.getTime() <= Date.now() ? 'expired' : 'sent'
  return {
    id: doc._id.toString(),
    name: doc.name,
    email: doc.email,
    propertyId: doc.propertyId?.toString(),
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    sendCount: doc.sendCount,
    usedAt: doc.usedAt,
    status,
  }
}

/** Create an invite. Returns the raw token ONCE — it is never recoverable afterwards. */
export async function createInvite(input: {
  name: string
  email: string
  propertyId?: string
}): Promise<{ invite: TenantInvite; token: string }> {
  const col = await invitesCollection()
  const token = newToken()
  const doc: TenantInviteDoc = {
    _id: new ObjectId(),
    tokenHash: hashToken(token),
    name: input.name.trim(),
    email: input.email.toLowerCase().trim(),
    propertyId: input.propertyId && ObjectId.isValid(input.propertyId) ? new ObjectId(input.propertyId) : undefined,
    createdAt: new Date(),
    expiresAt: expiryFromNow(),
    sendCount: 1,
  }
  await col.insertOne(doc)
  return { invite: toInvite(doc), token }
}

/**
 * Re-issue an unused invite: rotates the token (the old link stops working) and
 * restarts the expiry window. Returns null if the invite is missing or already used.
 */
export async function reissueInvite(id: string): Promise<{ invite: TenantInvite; token: string } | null> {
  if (!ObjectId.isValid(id)) return null
  const col = await invitesCollection()
  const token = newToken()
  const doc = await col.findOneAndUpdate(
    { _id: new ObjectId(id), usedAt: { $exists: false } },
    { $set: { tokenHash: hashToken(token), expiresAt: expiryFromNow() }, $inc: { sendCount: 1 } },
    { returnDocument: 'after' },
  )
  return doc ? { invite: toInvite(doc), token } : null
}

export async function getInviteById(id: string): Promise<TenantInvite | null> {
  if (!ObjectId.isValid(id)) return null
  const col = await invitesCollection()
  const doc = await col.findOne({ _id: new ObjectId(id) })
  return doc ? toInvite(doc) : null
}

/** Look up a usable (unused + unexpired) invite from the raw emailed token. */
export async function getValidInviteByToken(token: string | undefined): Promise<TenantInvite | null> {
  // Cheap shape check before touching the DB (tokens are 43 base64url chars).
  if (!token || token.length < 32 || token.length > 64) return null
  const col = await invitesCollection()
  const doc = await col.findOne({
    tokenHash: hashToken(token),
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  })
  return doc ? toInvite(doc) : null
}

/**
 * Atomically claim an invite so only ONE submission can redeem it. Returns false
 * if it was already used/expired. Call releaseInvite() if the signup then fails.
 */
export async function claimInvite(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await invitesCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(id), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
  )
  return res.modifiedCount === 1
}

/** Undo a claim after a failed signup so the invitee can retry with the same link. */
export async function releaseInvite(id: string): Promise<void> {
  if (!ObjectId.isValid(id)) return
  const col = await invitesCollection()
  await col.updateOne({ _id: new ObjectId(id) }, { $unset: { usedAt: '', tenantId: '' } })
}

/** Record which tenant redeemed the invite (for the admin list). */
export async function linkInviteToTenant(id: string, tenantId: string): Promise<void> {
  if (!ObjectId.isValid(id) || !ObjectId.isValid(tenantId)) return
  const col = await invitesCollection()
  await col.updateOne({ _id: new ObjectId(id) }, { $set: { tenantId: new ObjectId(tenantId) } })
}

export async function listInvites(): Promise<TenantInvite[]> {
  const col = await invitesCollection()
  const docs = await col.find({}).sort({ createdAt: -1 }).limit(100).toArray()
  return docs.map(toInvite)
}
