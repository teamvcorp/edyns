import 'server-only'

import { Binary, ObjectId, type Collection } from 'mongodb'
import { getDb } from './mongodb'
import { encryptBuffer, decryptBuffer } from './crypto'
import type { SniffedType } from './files'

/**
 * Leases — uploaded by outside-landlord applicants ("Your Home" / "Your Home + Car") so staff can
 * confirm the rent we'll be forwarding to their landlord.
 *
 * Same security model as paystubs (lib/paystubs.ts), because a lease holds
 * names, addresses and money terms (PII):
 *  - never stored on public Blob storage — no URL exists for it;
 *  - validated by magic bytes first (lib/files.ts checkUpload), not by the
 *    browser-declared type or filename;
 *  - encrypted with AES-256-GCM (EE_ENCRYPTION_KEY) at rest in Mongo;
 *  - readable only through the admin-gated route app/admin/tenants/[id]/lease
 *    with no-store caching.
 */

/** Stay under Vercel's ~4.5MB request-body cap (next.config.ts sets the action limit to 5mb). */
export const MAX_LEASE_BYTES = 4 * 1024 * 1024

interface LeaseDoc {
  _id: ObjectId
  tenantId: ObjectId
  /** iv | authTag | ciphertext (see lib/crypto.ts encryptBuffer). */
  data: Binary
  contentType: SniffedType
  size: number
  uploadedAt: Date
}

/**
 * 'current' = the lease for the tenant's active program; 'pending' = a lease
 * submitted with a program-change request, promoted to current only when an
 * admin approves (so a declined request never overwrites the real lease).
 */
export type LeaseSlot = 'current' | 'pending'
const COLLECTION: Record<LeaseSlot, string> = { current: 'leases', pending: 'pendingLeases' }

const indexReady: Partial<Record<LeaseSlot, Promise<unknown>>> = {}

async function leasesCollection(slot: LeaseSlot = 'current'): Promise<Collection<LeaseDoc>> {
  const db = await getDb()
  const col = db.collection<LeaseDoc>(COLLECTION[slot])
  // One lease per tenant per slot; a new upload replaces the old one.
  indexReady[slot] ??= col.createIndex({ tenantId: 1 }, { unique: true }).catch((err) => {
    indexReady[slot] = undefined
    throw err
  })
  await indexReady[slot]
  return col
}

/**
 * Encrypt and store (replacing any previous) lease for a tenant. Takes bytes that
 * were ALREADY validated with checkUpload(), so callers can reject a bad file
 * before creating the account.
 */
export async function saveLeaseFile(
  tenantId: string,
  file: { bytes: Buffer; contentType: SniffedType },
  slot: LeaseSlot = 'current',
): Promise<{ uploadedAt: Date }> {
  if (!ObjectId.isValid(tenantId)) throw new Error('saveLeaseFile: invalid tenant id')
  const uploadedAt = new Date()
  const col = await leasesCollection(slot)
  await col.updateOne(
    { tenantId: new ObjectId(tenantId) },
    {
      $set: {
        data: new Binary(encryptBuffer(file.bytes)),
        contentType: file.contentType,
        size: file.bytes.length,
        uploadedAt,
      },
      $setOnInsert: { _id: new ObjectId(), tenantId: new ObjectId(tenantId) },
    },
    { upsert: true },
  )
  return { uploadedAt }
}

/** Decrypt a tenant's lease for the admin viewer route. Null if none. */
export async function readLeaseFile(
  tenantId: string,
  slot: LeaseSlot = 'current',
): Promise<{ bytes: Buffer; contentType: SniffedType } | null> {
  if (!ObjectId.isValid(tenantId)) return null
  const col = await leasesCollection(slot)
  const doc = await col.findOne({ tenantId: new ObjectId(tenantId) })
  if (!doc) return null
  return { bytes: decryptBuffer(Buffer.from(doc.data.buffer)), contentType: doc.contentType }
}

/** Approve: the pending lease becomes the current one. Returns its metadata, or null if none. */
export async function promotePendingLease(tenantId: string): Promise<{ uploadedAt: Date; contentType: SniffedType } | null> {
  const pending = await readLeaseFile(tenantId, 'pending')
  if (!pending) return null
  const { uploadedAt } = await saveLeaseFile(tenantId, pending, 'current')
  await discardPendingLease(tenantId)
  return { uploadedAt, contentType: pending.contentType }
}

/** Decline (or replace) a request: drop its pending lease. */
export async function discardPendingLease(tenantId: string): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await leasesCollection('pending')
  await col.deleteOne({ tenantId: new ObjectId(tenantId) })
}
