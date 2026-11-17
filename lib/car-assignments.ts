import 'server-only'

import { ObjectId, MongoServerError, type Collection } from 'mongodb'
import { getDb } from './mongodb'

/**
 * Car program assignments — a car the PROGRAM owns (edynsgate, or its nonprofit
 * partner The Von Der Becke Academy Corp for donated cars), provided to a tenant (with
 * insurance paid by edynsgate) once they've paid the car program's 10% through
 * the trust period (CAR_TRUST_MONTHS in lib/programs.ts; an admin may provide
 * it earlier or later). If the tenant stops paying or leaves the program, the
 * car is returned.
 *
 * Lifecycle:  active → returned
 * At most ONE active assignment per tenant — enforced by a partial unique index,
 * so two admins can't assign two cars at once.
 *
 * Privacy: VIN / plate / insurance details are operational data shown only to
 * admins and the tenant themselves (never on public pages).
 */

export type CarAssignmentStatus = 'active' | 'returned'

interface CarAssignmentDoc {
  _id: ObjectId
  tenantId: ObjectId
  /** e.g. "2019 Honda Civic LX, silver" */
  vehicle: string
  vin?: string
  plate?: string
  /** Insurer / policy number edynsgate pays for. */
  insurance?: string
  notes?: string
  /** True when provided before the trust period ended (admin chose to go early). */
  early: boolean
  status: CarAssignmentStatus
  assignedAt: Date
  returnedAt?: Date
  returnReason?: string
}

export type CarAssignment = Omit<CarAssignmentDoc, '_id' | 'tenantId'> & { id: string; tenantId: string }

let indexReady: Promise<unknown> | undefined

async function assignmentsCollection(): Promise<Collection<CarAssignmentDoc>> {
  const db = await getDb()
  const col = db.collection<CarAssignmentDoc>('carAssignments')
  indexReady ??= Promise.all([
    col.createIndex({ tenantId: 1, assignedAt: -1 }),
    col.createIndex(
      { tenantId: 1 },
      { unique: true, partialFilterExpression: { status: 'active' }, name: 'one_active_car_per_tenant' },
    ),
  ]).catch((err) => {
    indexReady = undefined
    throw err
  })
  await indexReady
  return col
}

function toAssignment(doc: CarAssignmentDoc): CarAssignment {
  const { _id, tenantId, ...rest } = doc
  return { ...rest, id: _id.toString(), tenantId: tenantId.toString() }
}

/** Assign a car. Returns null when the tenant already has an active car. */
export async function assignCar(input: {
  tenantId: string
  vehicle: string
  vin?: string
  plate?: string
  insurance?: string
  notes?: string
  early: boolean
}): Promise<CarAssignment | null> {
  if (!ObjectId.isValid(input.tenantId)) return null
  const col = await assignmentsCollection()
  const doc: CarAssignmentDoc = {
    _id: new ObjectId(),
    tenantId: new ObjectId(input.tenantId),
    vehicle: input.vehicle,
    vin: input.vin,
    plate: input.plate,
    insurance: input.insurance,
    notes: input.notes,
    early: input.early,
    status: 'active',
    assignedAt: new Date(),
  }
  try {
    await col.insertOne(doc)
    return toAssignment(doc)
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) return null
    throw err
  }
}

export async function getCarAssignment(id: string): Promise<CarAssignment | null> {
  if (!ObjectId.isValid(id)) return null
  const col = await assignmentsCollection()
  const doc = await col.findOne({ _id: new ObjectId(id) })
  return doc ? toAssignment(doc) : null
}

/** The tenant's car currently in use, if any. */
export async function getActiveCar(tenantId: string): Promise<CarAssignment | null> {
  if (!ObjectId.isValid(tenantId)) return null
  const col = await assignmentsCollection()
  const doc = await col.findOne({ tenantId: new ObjectId(tenantId), status: 'active' })
  return doc ? toAssignment(doc) : null
}

export async function listCarAssignments(tenantId: string): Promise<CarAssignment[]> {
  if (!ObjectId.isValid(tenantId)) return []
  const col = await assignmentsCollection()
  const docs = await col.find({ tenantId: new ObjectId(tenantId) }).sort({ assignedAt: -1 }).limit(20).toArray()
  return docs.map(toAssignment)
}

/** Mark the active car returned (atomic: only an active assignment can be returned). */
export async function returnCar(id: string, reason: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await assignmentsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(id), status: 'active' },
    { $set: { status: 'returned', returnedAt: new Date(), returnReason: reason } },
  )
  return res.modifiedCount === 1
}
