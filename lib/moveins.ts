import 'server-only'

import { ObjectId, type Collection } from 'mongodb'
import { getDb } from './mongodb'

export type MoveInStatus = 'requested' | 'approved' | 'declined' | 'reversed' | 'evicted'

// Terminal states that release the tenant from the property — a new request for
// the same property is allowed again once a placement reaches one of these.
const INACTIVE_STATUSES: MoveInStatus[] = ['declined', 'reversed', 'evicted']

export interface MoveInRequestDoc {
  _id: ObjectId
  tenantId: ObjectId
  propertyId: ObjectId
  status: MoveInStatus
  createdAt: Date
  updatedAt: Date
}

export type MoveInRequest = {
  id: string
  tenantId: string
  propertyId: string
  status: MoveInStatus
  createdAt: Date
  updatedAt: Date
}

async function requestsCollection(): Promise<Collection<MoveInRequestDoc>> {
  const db = await getDb()
  const col = db.collection<MoveInRequestDoc>('moveInRequests')
  await col.createIndex({ tenantId: 1, propertyId: 1 })
  await col.createIndex({ status: 1 })
  return col
}

function toRequest(doc: MoveInRequestDoc): MoveInRequest {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId.toString(),
    propertyId: doc.propertyId.toString(),
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

/** Active = not declined; used to prevent duplicate open requests. */
export async function hasActiveRequest(tenantId: string, propertyId: string): Promise<boolean> {
  if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(propertyId)) return false
  const col = await requestsCollection()
  const doc = await col.findOne({
    tenantId: new ObjectId(tenantId),
    propertyId: new ObjectId(propertyId),
    status: { $nin: INACTIVE_STATUSES },
  })
  return doc !== null
}

export async function createMoveInRequest(tenantId: string, propertyId: string): Promise<MoveInRequest> {
  const col = await requestsCollection()
  const now = new Date()
  const doc: MoveInRequestDoc = {
    _id: new ObjectId(),
    tenantId: new ObjectId(tenantId),
    propertyId: new ObjectId(propertyId),
    status: 'requested',
    createdAt: now,
    updatedAt: now,
  }
  await col.insertOne(doc)
  return toRequest(doc)
}

export async function listRequestsByTenant(tenantId: string): Promise<MoveInRequest[]> {
  if (!ObjectId.isValid(tenantId)) return []
  const col = await requestsCollection()
  const docs = await col.find({ tenantId: new ObjectId(tenantId) }).sort({ createdAt: -1 }).toArray()
  return docs.map(toRequest)
}

export async function listAllRequests(): Promise<MoveInRequest[]> {
  const col = await requestsCollection()
  const docs = await col.find({}).sort({ createdAt: -1 }).toArray()
  return docs.map(toRequest)
}

export async function getRequestById(id: string): Promise<MoveInRequest | null> {
  if (!ObjectId.isValid(id)) return null
  const col = await requestsCollection()
  const doc = await col.findOne({ _id: new ObjectId(id) })
  return doc ? toRequest(doc) : null
}

export async function setRequestStatus(id: string, status: MoveInStatus): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await requestsCollection()
  const res = await col.updateOne({ _id: new ObjectId(id) }, { $set: { status, updatedAt: new Date() } })
  return res.matchedCount === 1
}
