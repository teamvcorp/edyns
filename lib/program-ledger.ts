import 'server-only'

import { ObjectId, MongoServerError, type Collection } from 'mongodb'
import { getDb } from './mongodb'

/**
 * Program ledger — money edynsgate holds for "Your Home + Car" (own_landlord)
 * and "Car Savings" (car_only) tenants. Effort Exchange rent is NOT recorded
 * here (it's platform revenue + partner equity, lib/equity.ts).
 *
 * Two buckets per tenant:
 *   rent — collected from the tenant, owed onward to their outside landlord.
 *          In: Stripe draft deposits + one-time shortfall payments.
 *          Out: landlord payments staff send manually (bill pay / ACH / check).
 *   car  — car savings held until an admin-approved car purchase.
 *          In: Stripe draft deposits. Out: car_release on purchase.
 *
 * Design rules (teaching notes):
 *  - Append-only. Balances are COMPUTED (aggregation) from entries, never stored,
 *    so they can't drift from the history. Corrections are new `adjustment` rows.
 *  - Every entry has a unique `ref` (Stripe invoice/session id, or a form nonce),
 *    so webhook retries and double-submits can't record money twice.
 *  - Amounts are signed integer cents: positive = money in, negative = money out.
 *  - Amounts from Stripe come from Stripe objects (price metadata), never forms.
 */

export const LEDGER_BUCKETS = ['rent', 'car'] as const
export type LedgerBucket = (typeof LEDGER_BUCKETS)[number]

export const LEDGER_KINDS = ['deposit', 'shortfall_payment', 'landlord_payment', 'car_release', 'adjustment'] as const
export type LedgerKind = (typeof LEDGER_KINDS)[number]

export const PAYOUT_METHODS = ['bill_pay', 'ach', 'check', 'other'] as const
export type PayoutMethod = (typeof PAYOUT_METHODS)[number]

interface LedgerDoc {
  _id: ObjectId
  tenantId: ObjectId
  bucket: LedgerBucket
  kind: LedgerKind
  /** Signed cents: + in, − out. */
  amountCents: number
  /** Idempotency key — unique across the collection. */
  ref: string
  /** When the money actually moved (invoice paid / check sent). */
  at: Date
  method?: PayoutMethod
  /** Check number, confirmation code, etc. */
  reference?: string
  note?: string
  source: 'stripe' | 'admin' | 'tenant'
  createdAt: Date
}

export type LedgerEntry = Omit<LedgerDoc, '_id' | 'tenantId'> & { id: string; tenantId: string }

let indexReady: Promise<unknown> | undefined

async function ledgerCollection(): Promise<Collection<LedgerDoc>> {
  const db = await getDb()
  const col = db.collection<LedgerDoc>('programLedger')
  indexReady ??= Promise.all([
    col.createIndex({ ref: 1 }, { unique: true }),
    col.createIndex({ tenantId: 1, at: -1 }),
  ]).catch((err) => {
    indexReady = undefined
    throw err
  })
  await indexReady
  return col
}

function toEntry(doc: LedgerDoc): LedgerEntry {
  const { _id, tenantId, ...rest } = doc
  return { ...rest, id: _id.toString(), tenantId: tenantId.toString() }
}

const isDuplicateKey = (err: unknown) => err instanceof MongoServerError && err.code === 11000

/**
 * Insert one entry. Returns 'duplicate' (not an error) when the ref was already
 * recorded — that's the idempotency guarantee doing its job.
 */
export async function recordLedgerEntry(input: {
  tenantId: string
  bucket: LedgerBucket
  kind: LedgerKind
  amountCents: number
  ref: string
  at: Date
  source: LedgerDoc['source']
  method?: PayoutMethod
  reference?: string
  note?: string
}): Promise<'recorded' | 'duplicate'> {
  if (!ObjectId.isValid(input.tenantId)) throw new Error('recordLedgerEntry: invalid tenant id')
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0) {
    throw new Error('recordLedgerEntry: amount must be a non-zero integer of cents')
  }
  const col = await ledgerCollection()
  try {
    await col.insertOne({
      _id: new ObjectId(),
      tenantId: new ObjectId(input.tenantId),
      bucket: input.bucket,
      kind: input.kind,
      amountCents: input.amountCents,
      ref: input.ref,
      at: input.at,
      method: input.method,
      reference: input.reference,
      note: input.note,
      source: input.source,
      createdAt: new Date(),
    })
    return 'recorded'
  } catch (err) {
    if (isDuplicateKey(err)) return 'duplicate'
    throw err
  }
}

/**
 * Record the rent and car parts of a paid program invoice (webhook). Each part
 * has its own ref so a partial failure + retry fills only what's missing.
 */
export async function recordInvoiceDeposits(input: {
  tenantId: string
  invoiceId: string
  rentCents: number
  carCents: number
  paidAt: Date
}): Promise<void> {
  if (input.rentCents > 0) {
    await recordLedgerEntry({
      tenantId: input.tenantId,
      bucket: 'rent',
      kind: 'deposit',
      amountCents: input.rentCents,
      ref: `inv:${input.invoiceId}:rent`,
      at: input.paidAt,
      source: 'stripe',
    })
  }
  if (input.carCents > 0) {
    await recordLedgerEntry({
      tenantId: input.tenantId,
      bucket: 'car',
      kind: 'deposit',
      amountCents: input.carCents,
      ref: `inv:${input.invoiceId}:car`,
      at: input.paidAt,
      source: 'stripe',
    })
  }
}

export type ProgramBalances = {
  /** Rent collected (drafts + shortfall payments) and not yet paid to the landlord. */
  rentHeldCents: number
  rentCollectedCents: number
  landlordPaidCents: number
  /** Car savings available. */
  carSavingsCents: number
  carDepositedCents: number
  carReleasedCents: number
}

const EMPTY: ProgramBalances = {
  rentHeldCents: 0,
  rentCollectedCents: 0,
  landlordPaidCents: 0,
  carSavingsCents: 0,
  carDepositedCents: 0,
  carReleasedCents: 0,
}

/** Balances for many tenants at once (admin list pages). Missing tenants get zeros. */
export async function balancesForTenants(tenantIds: string[]): Promise<Map<string, ProgramBalances>> {
  const ids = tenantIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
  const result = new Map<string, ProgramBalances>()
  for (const id of ids) result.set(id.toString(), { ...EMPTY })
  if (ids.length === 0) return result

  const col = await ledgerCollection()
  const rows = await col
    .aggregate<{ _id: { tenantId: ObjectId; bucket: LedgerBucket; kind: LedgerKind }; total: number }>([
      { $match: { tenantId: { $in: ids } } },
      { $group: { _id: { tenantId: '$tenantId', bucket: '$bucket', kind: '$kind' }, total: { $sum: '$amountCents' } } },
    ])
    .toArray()

  for (const { _id, total } of rows) {
    const b = result.get(_id.tenantId.toString())
    if (!b) continue
    if (_id.bucket === 'rent') {
      b.rentHeldCents += total
      if (_id.kind === 'landlord_payment') b.landlordPaidCents += -total
      else if (_id.kind === 'deposit' || _id.kind === 'shortfall_payment') b.rentCollectedCents += total
    } else {
      b.carSavingsCents += total
      if (_id.kind === 'car_release') b.carReleasedCents += -total
      else if (_id.kind === 'deposit') b.carDepositedCents += total
    }
  }
  return result
}

export async function balancesFor(tenantId: string): Promise<ProgramBalances> {
  return (await balancesForTenants([tenantId])).get(tenantId) ?? { ...EMPTY }
}

/** Most recent entries first. */
export async function listLedger(tenantId: string, limit = 50): Promise<LedgerEntry[]> {
  if (!ObjectId.isValid(tenantId)) return []
  const col = await ledgerCollection()
  const docs = await col.find({ tenantId: new ObjectId(tenantId) }).sort({ at: -1, createdAt: -1 }).limit(limit).toArray()
  return docs.map(toEntry)
}

/** Sum of one bucket's entries of the given kinds within [from, to). Used by the monthly shortfall check. */
export async function sumBetween(
  tenantId: string,
  bucket: LedgerBucket,
  kinds: LedgerKind[],
  from: Date,
  to: Date,
): Promise<number> {
  if (!ObjectId.isValid(tenantId)) return 0
  const col = await ledgerCollection()
  const [row] = await col
    .aggregate<{ total: number }>([
      { $match: { tenantId: new ObjectId(tenantId), bucket, kind: { $in: kinds }, at: { $gte: from, $lt: to } } },
      { $group: { _id: null, total: { $sum: '$amountCents' } } },
    ])
    .toArray()
  return row?.total ?? 0
}
