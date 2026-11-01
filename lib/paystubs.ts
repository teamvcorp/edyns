import 'server-only'

import { Binary, ObjectId, type Collection } from 'mongodb'
import { getDb } from './mongodb'
import { encryptBuffer, decryptBuffer } from './crypto'
import { sniffFileType, type SniffedType } from './files'

/**
 * Paystubs — ADMIN-ONLY, last-resort income evidence.
 *
 * Tenants must verify income through Plaid; they cannot upload documents. When
 * Plaid can't work for someone, an admin uploads the paystub here and then
 * records the verified figures with the manual income form.
 *
 * Security model (why this isn't on Vercel Blob like property photos):
 *  - Blob files are public URLs — anyone holding the link can read them. Pay
 *    data is sensitive PII, so it never gets a URL at all.
 *  - The file bytes travel to a Server Action (no client-supplied links), are
 *    type-checked by their magic bytes (not the browser-declared MIME type),
 *    encrypted with AES-256-GCM (EE_ENCRYPTION_KEY), and stored in Mongo.
 *  - The only way to read one back is the admin-gated route
 *    app/admin/tenants/[id]/paystub, which decrypts on the fly with no-store caching.
 */

/** Stay under Vercel's ~4.5MB request-body cap (next.config.ts sets the action limit to 5mb). */
export const MAX_PAYSTUB_BYTES = 4 * 1024 * 1024

export type PaystubType = SniffedType

interface PaystubDoc {
  _id: ObjectId
  tenantId: ObjectId
  /** iv | authTag | ciphertext (see lib/crypto.ts encryptBuffer). */
  data: Binary
  contentType: PaystubType
  size: number
  uploadedAt: Date
}

let indexReady: Promise<unknown> | undefined

async function paystubsCollection(): Promise<Collection<PaystubDoc>> {
  const db = await getDb()
  const col = db.collection<PaystubDoc>('paystubs')
  // One current paystub per tenant; a new upload replaces the old one.
  indexReady ??= col.createIndex({ tenantId: 1 }, { unique: true }).catch((err) => {
    indexReady = undefined
    throw err
  })
  await indexReady
  return col
}

export type SavePaystubResult =
  | { ok: true; contentType: PaystubType; uploadedAt: Date }
  | { ok: false; error: 'missing' | 'too-big' | 'bad-type' }

/** Validate, encrypt and store (replacing any previous) paystub for a tenant. */
export async function savePaystubFile(tenantId: string, file: File | null): Promise<SavePaystubResult> {
  if (!ObjectId.isValid(tenantId) || !file || file.size === 0) return { ok: false, error: 'missing' }
  if (file.size > MAX_PAYSTUB_BYTES) return { ok: false, error: 'too-big' }

  const bytes = Buffer.from(await file.arrayBuffer())
  const contentType = sniffFileType(bytes) // by magic bytes, not the browser's claim
  if (!contentType) return { ok: false, error: 'bad-type' }

  const uploadedAt = new Date()
  const col = await paystubsCollection()
  await col.updateOne(
    { tenantId: new ObjectId(tenantId) },
    {
      $set: { data: new Binary(encryptBuffer(bytes)), contentType, size: bytes.length, uploadedAt },
      $setOnInsert: { _id: new ObjectId(), tenantId: new ObjectId(tenantId) },
    },
    { upsert: true },
  )
  return { ok: true, contentType, uploadedAt }
}

/** Decrypt a tenant's paystub for the admin viewer route. Null if none. */
export async function readPaystubFile(tenantId: string): Promise<{ bytes: Buffer; contentType: PaystubType } | null> {
  if (!ObjectId.isValid(tenantId)) return null
  const col = await paystubsCollection()
  const doc = await col.findOne({ tenantId: new ObjectId(tenantId) })
  if (!doc) return null
  return { bytes: decryptBuffer(Buffer.from(doc.data.buffer)), contentType: doc.contentType }
}

/** Remove a tenant's stored paystub (verification reset). */
export async function deletePaystubFile(tenantId: string): Promise<void> {
  if (!ObjectId.isValid(tenantId)) return
  const col = await paystubsCollection()
  await col.deleteOne({ tenantId: new ObjectId(tenantId) })
}
