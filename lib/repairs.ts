import 'server-only'

import { Binary, ObjectId, type Collection } from 'mongodb'
import { getDb } from './mongodb'
import { encryptBuffer, decryptBuffer } from './crypto'
import { sniffFileType, IMAGE_TYPES, type SniffedType } from './files'
import { listPropertiesByPartner, getPropertyById, type Property } from './properties'
import { getTenantByUserId } from './tenants'
import type { SessionPayload } from './session'

/**
 * Repair requests — partners and tenants report problems with a home; admins
 * work them through a status queue.
 *
 * WHO MAY REQUEST (enforced server-side by `repairablePropertiesFor`):
 *  - partner → only their own properties with status 'approved' (the nonprofit
 *    takes on repairs once a property is accepted into the program).
 *  - tenant  → only the home they live in / pay rent on (`currentPropertyId`).
 *
 * WHO MAY SEE:
 *  - admin → everything.
 *  - requester → their own requests.
 *  - partner → every request on properties they CURRENTLY own (looked up by
 *    property, so an ownership transfer moves visibility with the deed), but
 *    tenant-submitted ones are stripped of tenant identity (`toPartnerView`).
 *
 * PHOTOS are interior shots of people's homes, so they're stored like paystubs:
 * type-checked by magic bytes, AES-256-GCM encrypted in Mongo, no public URL.
 * Served only by app/api/repairs/[id]/photos/[n] after an access check.
 */

export const REPAIR_CATEGORIES = [
  'plumbing',
  'electrical',
  'heating_cooling',
  'appliance',
  'roof_exterior',
  'pest',
  'other',
] as const
export type RepairCategory = (typeof REPAIR_CATEGORIES)[number]

export const CATEGORY_LABEL: Record<RepairCategory, string> = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  heating_cooling: 'Heating / cooling',
  appliance: 'Appliance',
  roof_exterior: 'Roof / exterior',
  pest: 'Pests',
  other: 'Other',
}

export const REPAIR_URGENCIES = ['emergency', 'urgent', 'routine'] as const
export type RepairUrgency = (typeof REPAIR_URGENCIES)[number]

export const REPAIR_STATUSES = ['open', 'scheduled', 'in_progress', 'completed', 'canceled'] as const
export type RepairStatus = (typeof REPAIR_STATUSES)[number]

export const STATUS_LABEL: Record<RepairStatus, string> = {
  open: 'Open',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  canceled: 'Canceled',
}

/** Limits (validated in the server action; exported so the form can show them). */
export const MAX_TITLE = 120
export const MAX_DESCRIPTION = 2000
export const MAX_ADMIN_NOTE = 1000
export const MAX_PHOTOS = 3
/** Total photo bytes per request — stays under the 5mb Server Action body limit (next.config.ts). */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024

interface RepairRequestDoc {
  _id: ObjectId
  propertyId: ObjectId
  requesterRole: 'partner' | 'tenant'
  requesterUserId: ObjectId
  category: RepairCategory
  urgency: RepairUrgency
  title: string
  description: string
  photoCount: number
  status: RepairStatus
  adminNote?: string
  statusHistory: { status: RepairStatus; at: Date }[]
  createdAt: Date
  updatedAt: Date
}

export type RepairRequest = {
  id: string
  propertyId: string
  /** Null in the partner view of a tenant-submitted request (identity hidden). */
  requesterRole: 'partner' | 'tenant'
  requesterUserId: string | null
  category: RepairCategory
  urgency: RepairUrgency
  title: string
  description: string
  photoCount: number
  status: RepairStatus
  adminNote?: string
  statusHistory: { status: RepairStatus; at: Date }[]
  createdAt: Date
  updatedAt: Date
}

interface RepairPhotoDoc {
  _id: ObjectId
  repairId: ObjectId
  index: number
  /** iv | authTag | ciphertext (lib/crypto.ts encryptBuffer). */
  data: Binary
  contentType: SniffedType
  size: number
}

let indexesReady: Promise<unknown> | undefined

async function collections(): Promise<{
  requests: Collection<RepairRequestDoc>
  photos: Collection<RepairPhotoDoc>
}> {
  const db = await getDb()
  const requests = db.collection<RepairRequestDoc>('repairRequests')
  const photos = db.collection<RepairPhotoDoc>('repairPhotos')
  // Idempotent but a round trip each — run once per server instance.
  indexesReady ??= Promise.all([
    requests.createIndex({ propertyId: 1, createdAt: -1 }),
    requests.createIndex({ requesterUserId: 1, createdAt: -1 }),
    requests.createIndex({ status: 1, createdAt: -1 }),
    photos.createIndex({ repairId: 1, index: 1 }, { unique: true }),
  ]).catch((err) => {
    indexesReady = undefined
    throw err
  })
  await indexesReady
  return { requests, photos }
}

function toRepair(doc: RepairRequestDoc): RepairRequest {
  return {
    id: doc._id.toString(),
    propertyId: doc.propertyId.toString(),
    requesterRole: doc.requesterRole,
    requesterUserId: doc.requesterUserId.toString(),
    category: doc.category,
    urgency: doc.urgency,
    title: doc.title,
    description: doc.description,
    photoCount: doc.photoCount,
    status: doc.status,
    adminNote: doc.adminNote,
    statusHistory: doc.statusHistory,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

/**
 * What a partner may see of a request on their property: tenant-submitted
 * requests have the tenant's identity removed (privacy). The partner's own
 * requests keep their id so the UI can offer "cancel".
 */
export function toPartnerView(repair: RepairRequest, partnerId: string): RepairRequest {
  if (repair.requesterRole === 'partner' && repair.requesterUserId === partnerId) return repair
  return { ...repair, requesterUserId: null }
}

// ---- Eligibility -----------------------------------------------------------

/**
 * The ONLY properties this signed-in user may file a repair request for.
 * Server actions must re-derive this list — never trust a propertyId from a form.
 */
export async function repairablePropertiesFor(session: SessionPayload): Promise<Property[]> {
  if (session.role === 'partner') {
    const props = await listPropertiesByPartner(session.sub)
    return props.filter((p) => p.status === 'approved')
  }
  if (session.role === 'tenant') {
    const tenant = await getTenantByUserId(session.sub)
    if (!tenant?.currentPropertyId) return []
    const home = await getPropertyById(tenant.currentPropertyId)
    return home ? [home] : []
  }
  return []
}

// ---- Photos ----------------------------------------------------------------

export type PhotoCheck =
  | { ok: true; photos: { bytes: Buffer; contentType: SniffedType }[] }
  | { ok: false; error: string }

/** Validate uploaded photo files: count, total size, and real image type (magic bytes). */
export async function checkRepairPhotos(files: File[]): Promise<PhotoCheck> {
  const real = files.filter((f) => f.size > 0) // an empty file input still submits one 0-byte entry
  if (real.length > MAX_PHOTOS) return { ok: false, error: `Attach at most ${MAX_PHOTOS} photos.` }
  const total = real.reduce((sum, f) => sum + f.size, 0)
  if (total > MAX_PHOTO_BYTES) return { ok: false, error: 'Photos are over 4 MB in total — please attach smaller ones.' }

  const photos: { bytes: Buffer; contentType: SniffedType }[] = []
  for (const f of real) {
    const bytes = Buffer.from(await f.arrayBuffer())
    const contentType = sniffFileType(bytes)
    if (!contentType || !IMAGE_TYPES.includes(contentType)) {
      return { ok: false, error: 'Photos must be JPEG, PNG or WebP images.' }
    }
    photos.push({ bytes, contentType })
  }
  return { ok: true, photos }
}

export async function readRepairPhoto(
  repairId: string,
  index: number,
): Promise<{ bytes: Buffer; contentType: SniffedType } | null> {
  if (!ObjectId.isValid(repairId) || !Number.isInteger(index) || index < 0 || index >= MAX_PHOTOS) return null
  const { photos } = await collections()
  const doc = await photos.findOne({ repairId: new ObjectId(repairId), index })
  if (!doc) return null
  return { bytes: decryptBuffer(Buffer.from(doc.data.buffer)), contentType: doc.contentType }
}

// ---- Requests --------------------------------------------------------------

export async function createRepairRequest(input: {
  propertyId: string
  requesterRole: 'partner' | 'tenant'
  requesterUserId: string
  category: RepairCategory
  urgency: RepairUrgency
  title: string
  description: string
  photos: { bytes: Buffer; contentType: SniffedType }[]
}): Promise<RepairRequest> {
  const { requests, photos } = await collections()
  const now = new Date()
  const doc: RepairRequestDoc = {
    _id: new ObjectId(),
    propertyId: new ObjectId(input.propertyId),
    requesterRole: input.requesterRole,
    requesterUserId: new ObjectId(input.requesterUserId),
    category: input.category,
    urgency: input.urgency,
    title: input.title,
    description: input.description,
    photoCount: input.photos.length,
    status: 'open',
    statusHistory: [{ status: 'open', at: now }],
    createdAt: now,
    updatedAt: now,
  }
  // Photos first: if they fail, no request row points at missing photos.
  if (input.photos.length) {
    await photos.insertMany(
      input.photos.map((p, index) => ({
        _id: new ObjectId(),
        repairId: doc._id,
        index,
        data: new Binary(encryptBuffer(p.bytes)),
        contentType: p.contentType,
        size: p.bytes.length,
      })),
    )
  }
  await requests.insertOne(doc)
  return toRepair(doc)
}

export async function getRepairById(id: string): Promise<RepairRequest | null> {
  if (!ObjectId.isValid(id)) return null
  const { requests } = await collections()
  const doc = await requests.findOne({ _id: new ObjectId(id) })
  return doc ? toRepair(doc) : null
}

/** All requests on the given properties (partner view — map through toPartnerView before display). */
export async function listRepairsForProperties(propertyIds: string[]): Promise<RepairRequest[]> {
  const ids = propertyIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
  if (!ids.length) return []
  const { requests } = await collections()
  const docs = await requests.find({ propertyId: { $in: ids } }).sort({ createdAt: -1 }).limit(200).toArray()
  return docs.map(toRepair)
}

export async function listRepairsByRequester(userId: string): Promise<RepairRequest[]> {
  if (!ObjectId.isValid(userId)) return []
  const { requests } = await collections()
  const docs = await requests.find({ requesterUserId: new ObjectId(userId) }).sort({ createdAt: -1 }).limit(200).toArray()
  return docs.map(toRepair)
}

/** Admin queue. Emergencies first, then newest. */
export async function listAllRepairs(status?: RepairStatus): Promise<RepairRequest[]> {
  const { requests } = await collections()
  const docs = await requests
    .find(status ? { status } : {})
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray()
  const rank: Record<RepairUrgency, number> = { emergency: 0, urgent: 1, routine: 2 }
  return docs.map(toRepair).sort((a, b) => rank[a.urgency] - rank[b.urgency])
}

/** Requests still needing action (open / scheduled / in progress). */
export async function countActiveRepairs(): Promise<number> {
  const { requests } = await collections()
  return requests.countDocuments({ status: { $in: ['open', 'scheduled', 'in_progress'] } })
}

/** Admin status change; records history. Returns the updated request or null. */
export async function setRepairStatus(id: string, status: RepairStatus, note?: string): Promise<RepairRequest | null> {
  if (!ObjectId.isValid(id)) return null
  const { requests } = await collections()
  const now = new Date()
  const doc = await requests.findOneAndUpdate(
    { _id: new ObjectId(id) },
    {
      $set: { status, updatedAt: now, ...(note ? { adminNote: note } : {}) },
      $push: { statusHistory: { status, at: now } },
    },
    { returnDocument: 'after' },
  )
  return doc ? toRepair(doc) : null
}

/** Requester cancels their own request — atomic: only theirs, only while still 'open'. */
export async function cancelOwnRepair(id: string, userId: string): Promise<boolean> {
  if (!ObjectId.isValid(id) || !ObjectId.isValid(userId)) return false
  const { requests } = await collections()
  const now = new Date()
  const res = await requests.updateOne(
    { _id: new ObjectId(id), requesterUserId: new ObjectId(userId), status: 'open' },
    { $set: { status: 'canceled', updatedAt: now }, $push: { statusHistory: { status: 'canceled', at: now } } },
  )
  return res.modifiedCount === 1
}

/**
 * May this session view this request (and its photos)? Admin: always.
 * Requester: own. Partner: if they currently own the property.
 */
export async function canViewRepair(session: SessionPayload, repair: RepairRequest): Promise<boolean> {
  if (session.role === 'admin') return true
  if (repair.requesterUserId === session.sub) return true
  if (session.role === 'partner') {
    const property = await getPropertyById(repair.propertyId)
    return property?.partnerId === session.sub
  }
  return false
}
