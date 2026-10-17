import 'server-only'

import { ObjectId, type Collection } from 'mongodb'
import { getDb } from './mongodb'

export type PayoutStatus = 'requested' | 'paid' | 'declined' | 'reversed'

/**
 * How a paid row came to be: a partner request the admin approved, an admin
 * force payout, or an external Stripe transfer auto-logged by the webhook
 * (e.g. made directly in the Stripe Dashboard).
 */
export type PayoutSource = 'request' | 'forced' | 'external'

export interface PayoutDoc {
  _id: ObjectId
  partnerId: ObjectId
  amountCents: number
  status: PayoutStatus
  stripeTransferId?: string
  source?: PayoutSource
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
  source?: PayoutSource
  note?: string
  requestedAt: Date
  decidedAt?: Date
}

async function payoutsCollection(): Promise<Collection<PayoutDoc>> {
  const db = await getDb()
  const col = db.collection<PayoutDoc>('payouts')
  await col.createIndex({ partnerId: 1, requestedAt: -1 })
  await col.createIndex({ status: 1 })
  // One debit row per Stripe transfer — makes action-write vs webhook-write
  // race-safe (sparse: requested/declined rows have no transfer id yet).
  await col.createIndex({ stripeTransferId: 1 }, { unique: true, sparse: true })
  return col
}

function toPayout(d: PayoutDoc): Payout {
  return {
    id: d._id.toString(),
    partnerId: d.partnerId.toString(),
    amountCents: d.amountCents,
    status: d.status,
    stripeTransferId: d.stripeTransferId,
    source: d.source,
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

/**
 * Record an already-paid payout: the debit for a Stripe transfer done in the
 * caller (admin force payout) or observed by the webhook (external transfer).
 * Idempotent on the transfer id — the same transfer recorded by both the admin
 * action and the webhook yields exactly one row (duplicate insert is ignored).
 */
export async function createPaidPayout(
  partnerId: string,
  amountCents: number,
  stripeTransferId: string,
  source: PayoutSource,
  opts?: { paidAt?: Date; note?: string },
): Promise<void> {
  if (!ObjectId.isValid(partnerId)) return
  const col = await payoutsCollection()
  const at = opts?.paidAt ?? new Date()
  try {
    await col.insertOne({
      _id: new ObjectId(),
      partnerId: new ObjectId(partnerId),
      amountCents,
      status: 'paid',
      stripeTransferId,
      source,
      note: opts?.note,
      requestedAt: at,
      decidedAt: at,
    })
  } catch (err) {
    // Duplicate transfer id (already recorded) — safe to ignore; rethrow anything else.
    if (!(err && typeof err === 'object' && 'code' in err && (err as { code?: number }).code === 11000)) {
      throw err
    }
  }
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
    { $set: { status: 'paid', source: 'request' satisfies PayoutSource, stripeTransferId, decidedAt: new Date() } },
  )
  return res.modifiedCount === 1
}

/**
 * Flip the debit for a (fully) reversed Stripe transfer. A 'reversed' row drops
 * out of the paid total, restoring the partner's available balance. Partial
 * reversals are out of scope — Stripe only fires transfer.reversed when the
 * full amount is reversed.
 */
export async function markPayoutReversedByTransfer(stripeTransferId: string): Promise<boolean> {
  const col = await payoutsCollection()
  const res = await col.updateOne(
    { stripeTransferId, status: 'paid' },
    { $set: { status: 'reversed', decidedAt: new Date() } },
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
