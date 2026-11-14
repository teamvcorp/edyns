import 'server-only'

import { ObjectId, MongoServerError, type Collection } from 'mongodb'
import { getDb } from './mongodb'

/**
 * Car offers — the end of the car-savings path. When a tenant's car savings
 * (program ledger, bucket 'car') cover an available vehicle, an admin records
 * an OFFER; the tenant accepts or declines in their portal; after the purchase
 * the admin marks it purchased, which releases the savings (ledger
 * `car_release`). Manual inventory: the vehicle is a free-text description.
 *
 * Lifecycle: offered → accepted → purchased
 *                    ↘ declined        (tenant)
 *            offered/accepted → withdrawn (admin)
 * At most ONE open offer (offered | accepted) per tenant — enforced by a
 * partial unique index, so two admins can't create competing offers.
 */

export const CAR_OFFER_STATUSES = ['offered', 'accepted', 'declined', 'purchased', 'withdrawn'] as const
export type CarOfferStatus = (typeof CAR_OFFER_STATUSES)[number]

interface CarOfferDoc {
  _id: ObjectId
  tenantId: ObjectId
  /** e.g. "2019 Honda Civic LX, 62k miles, VIN …4821" */
  vehicle: string
  priceCents: number
  notes?: string
  status: CarOfferStatus
  createdAt: Date
  respondedAt?: Date
  purchasedAt?: Date
  withdrawnAt?: Date
}

export type CarOffer = Omit<CarOfferDoc, '_id' | 'tenantId'> & { id: string; tenantId: string }

const OPEN: CarOfferStatus[] = ['offered', 'accepted']

let indexReady: Promise<unknown> | undefined

async function offersCollection(): Promise<Collection<CarOfferDoc>> {
  const db = await getDb()
  const col = db.collection<CarOfferDoc>('carOffers')
  indexReady ??= Promise.all([
    col.createIndex({ tenantId: 1, createdAt: -1 }),
    col.createIndex(
      { tenantId: 1 },
      { unique: true, partialFilterExpression: { status: { $in: OPEN } }, name: 'one_open_offer_per_tenant' },
    ),
  ]).catch((err) => {
    indexReady = undefined
    throw err
  })
  await indexReady
  return col
}

function toOffer(doc: CarOfferDoc): CarOffer {
  const { _id, tenantId, ...rest } = doc
  return { ...rest, id: _id.toString(), tenantId: tenantId.toString() }
}

/** Create an offer. Returns null when the tenant already has an open one. */
export async function createCarOffer(input: {
  tenantId: string
  vehicle: string
  priceCents: number
  notes?: string
}): Promise<CarOffer | null> {
  if (!ObjectId.isValid(input.tenantId)) return null
  const col = await offersCollection()
  const doc: CarOfferDoc = {
    _id: new ObjectId(),
    tenantId: new ObjectId(input.tenantId),
    vehicle: input.vehicle,
    priceCents: input.priceCents,
    notes: input.notes,
    status: 'offered',
    createdAt: new Date(),
  }
  try {
    await col.insertOne(doc)
    return toOffer(doc)
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) return null
    throw err
  }
}

export async function getCarOffer(id: string): Promise<CarOffer | null> {
  if (!ObjectId.isValid(id)) return null
  const col = await offersCollection()
  const doc = await col.findOne({ _id: new ObjectId(id) })
  return doc ? toOffer(doc) : null
}

/** The tenant's open (offered/accepted) offer, if any. */
export async function getOpenCarOffer(tenantId: string): Promise<CarOffer | null> {
  if (!ObjectId.isValid(tenantId)) return null
  const col = await offersCollection()
  const doc = await col.findOne({ tenantId: new ObjectId(tenantId), status: { $in: OPEN } })
  return doc ? toOffer(doc) : null
}

export async function listCarOffers(tenantId: string): Promise<CarOffer[]> {
  if (!ObjectId.isValid(tenantId)) return []
  const col = await offersCollection()
  const docs = await col.find({ tenantId: new ObjectId(tenantId) }).sort({ createdAt: -1 }).limit(20).toArray()
  return docs.map(toOffer)
}

/**
 * Move an offer between states atomically: only succeeds if it's currently in
 * one of `from` (prevents double-accepts, accept-after-withdraw, etc.).
 */
export async function transitionCarOffer(
  id: string,
  from: CarOfferStatus[],
  to: CarOfferStatus,
  extra: { tenantId?: string } = {},
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await offersCollection()
  const now = new Date()
  const stamp: Partial<CarOfferDoc> =
    to === 'accepted' || to === 'declined'
      ? { respondedAt: now }
      : to === 'purchased'
        ? { purchasedAt: now }
        : to === 'withdrawn'
          ? { withdrawnAt: now }
          : {}
  const filter: Record<string, unknown> = { _id: new ObjectId(id), status: { $in: from } }
  // Tenant responses are scoped to their own offer (ownership check in the query itself).
  if (extra.tenantId) {
    if (!ObjectId.isValid(extra.tenantId)) return false
    filter.tenantId = new ObjectId(extra.tenantId)
  }
  const res = await col.updateOne(filter, { $set: { status: to, ...stamp } })
  return res.modifiedCount === 1
}
