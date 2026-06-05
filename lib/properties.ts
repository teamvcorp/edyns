import 'server-only'

import { ObjectId, type Collection } from 'mongodb'
import { getDb } from './mongodb'
import type { Address } from './users'

export type PropertyStatus = 'pending' | 'approved' | 'rejected'

export interface PropertyDoc {
  _id: ObjectId
  partnerId: ObjectId
  address: Address
  bedrooms: number
  bathrooms: number
  squareFeet: number
  lotSize: string
  coordinates?: { lat: number; lng: number }
  thumbnailUrl?: string
  galleryUrls: string[]
  assessedValue: number
  askingPrice: number
  /** Set by an admin at approval — what the partner will receive on cash-out. */
  equityGenerated?: number
  /** Housing tier (0-5). Admin sets this before approving. */
  tier?: number
  /** Minimum tenant monthly income (USD) required to move into this property. */
  incomeRequirement?: number
  status: PropertyStatus
  rejectionReason?: string
  createdAt: Date
  updatedAt: Date
  approvedAt?: Date
}

/** Plain, serializable shape for passing to Client Components. */
export type Property = Omit<PropertyDoc, '_id' | 'partnerId'> & { id: string; partnerId: string }

export interface PropertyInput {
  address: Address
  bedrooms: number
  bathrooms: number
  squareFeet: number
  lotSize: string
  coordinates?: { lat: number; lng: number }
  thumbnailUrl?: string
  galleryUrls: string[]
  assessedValue: number
  askingPrice: number
  tier?: number
  incomeRequirement?: number
}

async function propertiesCollection(): Promise<Collection<PropertyDoc>> {
  const db = await getDb()
  const col = db.collection<PropertyDoc>('properties')
  await col.createIndex({ partnerId: 1, createdAt: -1 })
  await col.createIndex({ status: 1 })
  return col
}

function toProperty(doc: PropertyDoc): Property {
  const { _id, partnerId, ...rest } = doc
  return { ...rest, id: _id.toString(), partnerId: partnerId.toString() }
}

export async function createProperty(partnerId: string, input: PropertyInput): Promise<Property> {
  const col = await propertiesCollection()
  const now = new Date()
  const doc: PropertyDoc = {
    _id: new ObjectId(),
    partnerId: new ObjectId(partnerId),
    ...input,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }
  await col.insertOne(doc)
  return toProperty(doc)
}

export async function listPropertiesByPartner(partnerId: string): Promise<Property[]> {
  if (!ObjectId.isValid(partnerId)) return []
  const col = await propertiesCollection()
  const docs = await col.find({ partnerId: new ObjectId(partnerId) }).sort({ createdAt: -1 }).toArray()
  return docs.map(toProperty)
}

/**
 * Delete a property only if it belongs to the partner AND is still pending.
 * Approved/rejected properties are locked because equity is involved.
 * Returns true if a document was deleted.
 */
export async function deletePendingProperty(id: string, partnerId: string): Promise<boolean> {
  if (!ObjectId.isValid(id) || !ObjectId.isValid(partnerId)) return false
  const col = await propertiesCollection()
  const res = await col.deleteOne({
    _id: new ObjectId(id),
    partnerId: new ObjectId(partnerId),
    status: 'pending',
  })
  return res.deletedCount === 1
}

export async function getPropertyById(id: string): Promise<Property | null> {
  if (!ObjectId.isValid(id)) return null
  const col = await propertiesCollection()
  const doc = await col.findOne({ _id: new ObjectId(id) })
  return doc ? toProperty(doc) : null
}

// ---- Admin ----

export async function listAllProperties(status?: PropertyStatus): Promise<Property[]> {
  const col = await propertiesCollection()
  const filter = status ? { status } : {}
  const docs = await col.find(filter).sort({ createdAt: -1 }).toArray()
  return docs.map(toProperty)
}

/** Public listing — only approved properties, ordered by tier then newest. */
export async function listApprovedProperties(filter?: { zip?: string; tier?: number }): Promise<Property[]> {
  const col = await propertiesCollection()
  const query: Record<string, unknown> = { status: 'approved' }
  if (filter?.zip) query['address.postalCode'] = filter.zip
  if (filter?.tier !== undefined && Number.isFinite(filter.tier)) query.tier = filter.tier
  const docs = await col.find(query).sort({ tier: 1, createdAt: -1 }).toArray()
  return docs.map(toProperty)
}

export async function approveProperty(
  id: string,
  opts: { equityGenerated: number; tier: number; incomeRequirement: number },
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await propertiesCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: 'approved',
        equityGenerated: opts.equityGenerated,
        tier: opts.tier,
        incomeRequirement: opts.incomeRequirement,
        approvedAt: new Date(),
        updatedAt: new Date(),
      },
      $unset: { rejectionReason: '' },
    },
  )
  return res.matchedCount === 1
}

export async function rejectProperty(id: string, reason: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await propertiesCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: 'rejected', rejectionReason: reason, updatedAt: new Date() } },
  )
  return res.matchedCount === 1
}

/** Admin edit of any property field (including status & equity). */
export async function updateProperty(
  id: string,
  input: PropertyInput & { status: PropertyStatus; equityGenerated?: number },
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await propertiesCollection()
  const set: Partial<PropertyDoc> = { ...input, updatedAt: new Date() }
  if (input.status === 'approved' && !('approvedAt' in set)) set.approvedAt = new Date()
  const res = await col.updateOne({ _id: new ObjectId(id) }, { $set: set })
  return res.matchedCount === 1
}

/** Admin override delete — works regardless of status. */
export async function adminDeleteProperty(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await propertiesCollection()
  const res = await col.deleteOne({ _id: new ObjectId(id) })
  return res.deletedCount === 1
}

/** Total equity generated (USD) across a partner's approved properties. */
export async function totalEquityByPartner(partnerId: string): Promise<number> {
  if (!ObjectId.isValid(partnerId)) return 0
  const col = await propertiesCollection()
  const rows = await col
    .aggregate<{ total: number }>([
      { $match: { partnerId: new ObjectId(partnerId), status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$equityGenerated' } } },
    ])
    .toArray()
  return rows[0]?.total ?? 0
}

/** Map of partnerId -> property count (admin list). */
export async function propertyCountsByPartner(): Promise<Record<string, number>> {
  const col = await propertiesCollection()
  const rows = await col.aggregate<{ _id: ObjectId; count: number }>([
    { $group: { _id: '$partnerId', count: { $sum: 1 } } },
  ]).toArray()
  const out: Record<string, number> = {}
  for (const r of rows) out[r._id.toString()] = r.count
  return out
}
