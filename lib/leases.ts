import 'server-only'

import { Binary, ObjectId, type Collection } from 'mongodb'
import { getDb } from './mongodb'
import { encryptBuffer, decryptBuffer } from './crypto'
import type { SniffedType } from './files'

/**
 * Leases — uploaded by "Your Home + Car" (own_landlord) applicants so staff can
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

let indexReady: Promise<unknown> | undefined

async function leasesCollection(): Promise<Collection<LeaseDoc>> {
  const db = await getDb()
  const col = db.collection<LeaseDoc>('leases')
  // One current lease per tenant; a new upload replaces the old one.
  indexReady ??= col.createIndex({ tenantId: 1 }, { unique: true }).catch((err) => {
    indexReady = undefined
    throw err
  })
  await indexReady
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
): Promise<{ uploadedAt: Date }> {
  if (!ObjectId.isValid(tenantId)) throw new Error('saveLeaseFile: invalid tenant id')
  const uploadedAt = new Date()
  const col = await leasesCollection()
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
export async function readLeaseFile(tenantId: string): Promise<{ bytes: Buffer; contentType: SniffedType } | null> {
  if (!ObjectId.isValid(tenantId)) return null
  const col = await leasesCollection()
  const doc = await col.findOne({ tenantId: new ObjectId(tenantId) })
  if (!doc) return null
  return { bytes: decryptBuffer(Buffer.from(doc.data.buffer)), contentType: doc.contentType }
}
