import 'server-only'

import { ObjectId, type Collection } from 'mongodb'
import { getDb } from './mongodb'

export type PayoutStatus = 'requested' | 'paid' | 'declined'

export interface PayoutDoc {
  _id: ObjectId
  partnerId: ObjectId
  amountCents: number
  status: PayoutStatus
  stripeTransferId?: string
  note?: string
  requestedAt: Date
  decidedAt?: Date
}

export type Payout = {
  id: string
  partnerId: string
  amountCents: number
  status: PayoutStatus
  stripeTransferId?: string
  note?: string
  requestedAt: Date
  decidedAt?: Date
}

async function payoutsCollection(): Promise<Collection<PayoutDoc>> {
  const db = await getDb()
  const col = db.collection<PayoutDoc>('payouts')
  await col.createIndex({ partnerId: 1, requestedAt: -1 })
  await col.createIndex({ status: 1 })
  return col
}

function toPayout(d: PayoutDoc): Payout {
  return {
    id: d._id.toString(),
    partnerId: d.partnerId.toString(),
    amountCents: d.amountCents,
    status: d.status,
    stripeTransferId: d.stripeTransferId,
    note: d.note,
    requestedAt: d.requestedAt,
    decidedAt: d.decidedAt,
  }
}

export async function createPayoutRequest(partnerId: string, amountCents: number): Promise<void> {
  const col = await payoutsCollection()
  await col.insertOne({
    _id: new ObjectId(),
    partnerId: new ObjectId(partnerId),
    amountCents,
    status: 'requested',
    requestedAt: new Date(),
  })
}

/** Record an already-paid payout (admin force payout — transfer done in the caller). */
export async function createPaidPayout(
  partnerId: string,
  amountCents: number,
  stripeTransferId: string,
): Promise<void> {
  const col = await payoutsCollection()
  const now = new Date()
  await col.insertOne({
    _id: new ObjectId(),
    partnerId: new ObjectId(partnerId),
    amountCents,
    status: 'paid',
    stripeTransferId,
    requestedAt: now,
    decidedAt: now,
  })
}

export async function hasPendingRequest(partnerId: string): Promise<boolean> {
  if (!ObjectId.isValid(partnerId)) return false
  const col = await payoutsCollection()
  return (await col.findOne({ partnerId: new ObjectId(partnerId), status: 'requested' })) !== null
}

export async function listPayoutsByPartner(partnerId: string): Promise<Payout[]> {
  if (!ObjectId.isValid(partnerId)) return []
  const col = await payoutsCollection()
  const docs = await col.find({ partnerId: new ObjectId(partnerId) }).sort({ requestedAt: -1 }).toArray()
  return docs.map(toPayout)
}

async function sumByStatus(partnerId: string, status: PayoutStatus): Promise<number> {
  if (!ObjectId.isValid(partnerId)) return 0
  const col = await payoutsCollection()
  const rows = await col
    .aggregate<{ total: number }>([
      { $match: { partnerId: new ObjectId(partnerId), status } },
      { $group: { _id: null, total: { $sum: '$amountCents' } } },
    ])
    .toArray()
  return rows[0]?.total ?? 0
}

/** Total already paid out, in cents. */
export const totalPaidCentsByPartner = (partnerId: string) => sumByStatus(partnerId, 'paid')
/** Total requested but not yet decided, in cents. */
export const pendingCentsByPartner = (partnerId: string) => sumByStatus(partnerId, 'requested')

// ---- Admin ----

export async function listAllPayoutRequests(): Promise<Payout[]> {
  const col = await payoutsCollection()
  const docs = await col.find({}).sort({ requestedAt: -1 }).toArray()
  return docs.map(toPayout)
}

export async function getPayoutById(id: string): Promise<Payout | null> {
  if (!ObjectId.isValid(id)) return null
  const col = await payoutsCollection()
  const doc = await col.findOne({ _id: new ObjectId(id) })
  return doc ? toPayout(doc) : null
}

export async function markPayoutPaid(id: string, stripeTransferId: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await payoutsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(id), status: 'requested' },
    { $set: { status: 'paid', stripeTransferId, decidedAt: new Date() } },
  )
  return res.modifiedCount === 1
}

export async function markPayoutDeclined(id: string, note: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await payoutsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(id), status: 'requested' },
    { $set: { status: 'declined', note, decidedAt: new Date() } },
  )
  return res.modifiedCount === 1
}
