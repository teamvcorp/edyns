import 'server-only'

import { ObjectId, MongoServerError, type Collection } from 'mongodb'
import type Stripe from 'stripe'
import type { Transaction, RemovedTransaction } from 'plaid'
import { getDb } from './mongodb'
import {
  getTenantById,
  getTenantByBankItem,
  setBankCursor,
  pausePaycheckMode,
  type Tenant,
} from './tenants'
import { PROGRAMS, programOf, pct, rateSummary } from './programs'
import { withProcessingFee } from './fees'
import { decryptString } from './crypto'
import { syncAllTransactions } from './plaid'
import { createPaycheckPaymentIntent, getBankAccountLast4 } from './stripe'
import { recordTenantPayment } from './tenant-payments'
import { sendPaycheckCollectionEmail, sendPaycheckFailedEmail } from './email'
import { formatCents } from './format'
import { logError, logWarn } from './log'

/**
 * PER-PAYCHECK COLLECTION — the program percentage taken from each paycheck as
 * it arrives (plan: docs/plans/paycheck-collection.md).
 *
 *   Plaid webhook (SYNC_UPDATES_AVAILABLE) ─► syncTenantDeposits()
 *     └─ classify each new inflow on the linked account ─► `paycheckDeposits`
 *          └─ 'queued' ─► collectDeposit() ─► Stripe off-session ACH debit
 *               └─ Stripe webhook ─► markCollection{Processing,Succeeded,Failed}
 *                    └─ succeeded ─► recordTenantPayment() (equity or ledger)
 *
 * Safety rules (teaching notes — each is enforced in code below):
 *  - FEATURE FLAG: nothing is debited unless PAYCHECK_COLLECTION_ENABLED=true.
 *  - NO BACK-CHARGING: deposits dated before `paycheck.collectFrom` are stored
 *    as 'history' (for income review) and never collected. The first Plaid sync
 *    returns ~90 days of history, so this matters on day one.
 *  - ONE DEBIT PER PAYCHECK: unique index on the Plaid transaction id, an atomic
 *    queued→collecting claim, and a Stripe idempotency key per attempt.
 *  - SAME ACCOUNT: the Stripe payment method must be a US bank account whose
 *    last 4 equals the Plaid account mask.
 *  - AUTHORIZED RANGE: a debit above the tenant's authorized max is held for
 *    review instead of auto-collected (variable-amount debit rules).
 *  - Amounts come from Plaid + our program rates — never from a form.
 */

// ---- Configuration -------------------------------------------------------------

/** Master switch. Off by default; production stays off until Plaid approval + legal review. */
export function paycheckCollectionEnabled(): boolean {
  return process.env.PAYCHECK_COLLECTION_ENABLED === 'true'
}

/** Inflows below this are ignored (refunds, interest, small transfers). */
export const MIN_DEPOSIT_CENTS = 5000
/** Don't auto-debit a paycheck older than this (late-arriving data → admin review instead). */
export const MAX_DEPOSIT_AGE_DAYS = 7
/**
 * Employees' NON-wage deposits are collected automatically while the tenant owes
 * edynsgate (unpaid shortfall, failed collection, past-due billing); otherwise
 * they go to admin review. Interpretation of the 2026-11-14 decision — flip here
 * if the business rule is different.
 */
export const AUTO_COLLECT_NON_WAGE_WHEN_OWING = true

/**
 * Plaid sandbox banks and Stripe test bank accounts can never share a last-4, so
 * the same-account rule would block every test. Allowed ONLY when Plaid is in
 * sandbox AND Stripe uses a test key — impossible in production.
 */
export function accountMismatchAllowedForTesting(): boolean {
  return process.env.PLAID_ENV === 'sandbox' && Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'))
}

/** Bump when the authorization wording changes (stored with each acceptance). */
export const AUTHORIZATION_VERSION = 'paycheck-v1-2026-11-14'

// ---- Data model ----------------------------------------------------------------

export type DepositClass =
  | 'history' // before collectFrom — kept for income review, never collected
  | 'ignored' // too small / own-account transfer / admin ignored
  | 'review' // waiting for an admin to include or ignore
  | 'queued' // will be collected
  | 'collecting' // claimed; creating the Stripe debit
  | 'processing' // Stripe debit in flight (ACH ~4 business days)
  | 'collected'
  | 'failed'
  | 'removed' // Plaid removed the transaction before we collected

export type DepositReason =
  | 'wages'
  | 'self_employed'
  | 'owing'
  | 'not_wages'
  | 'too_small'
  | 'own_transfer'
  | 'too_old'
  | 'over_range'
  | 'before_start'
  | 'admin_include'
  | 'admin_ignore'

interface DepositDoc {
  _id: ObjectId
  tenantId: ObjectId
  plaidTransactionId: string
  accountId: string
  /** Positive cents (Plaid reports inflows as negative amounts). */
  amountCents: number
  /** yyyy-mm-dd posted date. */
  date: string
  /** Payer name for admin review (merchant/counterparty). No account numbers. */
  payer?: string
  category?: string
  status: DepositClass
  reason: DepositReason
  collection?: {
    attempt: number
    paymentIntentId?: string
    rentCents: number
    carCents: number
    chargedCents: number
    failureCode?: string
    initiatedAt?: Date
    completedAt?: Date
  }
  decidedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export type PaycheckDeposit = Omit<DepositDoc, '_id' | 'tenantId'> & { id: string; tenantId: string }

let indexReady: Promise<unknown> | undefined

async function depositsCollection(): Promise<Collection<DepositDoc>> {
  const db = await getDb()
  const col = db.collection<DepositDoc>('paycheckDeposits')
  indexReady ??= Promise.all([
    col.createIndex({ plaidTransactionId: 1 }, { unique: true }),
    col.createIndex({ tenantId: 1, date: -1 }),
    col.createIndex({ status: 1 }),
    col.createIndex({ 'collection.paymentIntentId': 1 }),
  ]).catch((err) => {
    indexReady = undefined
    throw err
  })
  await indexReady
  return col
}

function toDeposit(doc: DepositDoc): PaycheckDeposit {
  const { _id, tenantId, ...rest } = doc
  return { ...rest, id: _id.toString(), tenantId: tenantId.toString() }
}

export async function listDeposits(tenantId: string, limit = 50): Promise<PaycheckDeposit[]> {
  if (!ObjectId.isValid(tenantId)) return []
  const col = await depositsCollection()
  const docs = await col
    .find({ tenantId: new ObjectId(tenantId), status: { $ne: 'removed' } })
    .sort({ date: -1, createdAt: -1 })
    .limit(limit)
    .toArray()
  return docs.map(toDeposit)
}

/** Total inflows Plaid saw per month (yyyy-mm → cents), for the statement cross-check. */
export async function monthlyDepositTotals(tenantId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!ObjectId.isValid(tenantId)) return out
  const col = await depositsCollection()
  const rows = await col
    .aggregate<{ _id: string; total: number }>([
      { $match: { tenantId: new ObjectId(tenantId), status: { $nin: ['removed', 'ignored'] } } },
      { $group: { _id: { $substrBytes: ['$date', 0, 7] }, total: { $sum: '$amountCents' } } },
    ])
    .toArray()
  for (const r of rows) out.set(r._id, r.total)
  return out
}

// ---- Money math ----------------------------------------------------------------

/** Program split of one deposit, in base cents (before the processing fee). */
export function splitDeposit(tenant: Tenant, amountCents: number): { rentCents: number; carCents: number; baseCents: number } {
  const { rentRate, carRate } = PROGRAMS[programOf(tenant)]
  const rentCents = Math.round(amountCents * rentRate)
  const carCents = Math.round(amountCents * carRate)
  return { rentCents, carCents, baseCents: rentCents + carCents }
}

/** Default authorized per-debit max: the program share of one full month's income. */
export function defaultRangeMaxCents(tenant: Tenant): number {
  const income = tenant.employment.verifiedMonthlyIncome ?? tenant.employment.monthlyIncome ?? 0
  const { rentRate, carRate } = PROGRAMS[programOf(tenant)]
  return Math.max(0, Math.round(income * 100 * (rentRate + carRate)))
}

/** The exact authorization text the tenant accepts (stored verbatim). LEGAL REVIEW. */
export function buildAuthorizationText(tenant: Tenant, accountMask: string | undefined, rangeMaxCents: number): string {
  const program = programOf(tenant)
  return [
    `I authorize edynsgate to debit my bank account${accountMask ? ` ending in ${accountMask}` : ''} each time a paycheck or other qualifying deposit arrives in that account.`,
    `Each debit equals ${rateSummary(program)} (${pct(PROGRAMS[program].rentRate + PROGRAMS[program].carRate)}% in total) of that deposit, plus the payment processing fee, under my ${PROGRAMS[program].label} program.`,
    `I understand the amount varies with each deposit. I will receive an email receipt for every debit. Any single debit above ${formatCents(rangeMaxCents)} (before the processing fee) will not be made automatically and I will be notified first.`,
    'This authorization stays in effect until I revoke it by contacting edynsgate. Revoking it ends paycheck collection; my program obligations continue under the Terms of Service.',
  ].join(' ')
}

/** True when the tenant currently owes edynsgate (drives non-wage auto-collection). */
export async function tenantOwes(tenant: Tenant): Promise<boolean> {
  if (tenant.shortfall && !tenant.shortfall.paidAt) return true
  if (tenant.billing?.status === 'past_due') return true
  const col = await depositsCollection()
  return (await col.countDocuments({ tenantId: new ObjectId(tenant.id), status: 'failed' }, { limit: 1 })) > 0
}

// ---- Classification --------------------------------------------------------------

function daysAgo(dateStr: string): number {
  return (Date.now() - new Date(`${dateStr}T12:00:00Z`).getTime()) / 86_400_000
}

/**
 * Decide what to do with ONE posted inflow on the linked account. Pure function
 * (no I/O) so it's easy to reason about and test.
 * PFC values per Plaid's taxonomy (verify INCOME_WAGES / TRANSFER_IN_* against
 * docs/vendor/plaid-transactions.md before launch).
 */
export function classifyDeposit(
  tx: Transaction,
  ctx: { tenant: Tenant; owes: boolean; collectFrom: Date | null; rangeMaxCents: number },
): { status: DepositClass; reason: DepositReason } {
  const amountCents = Math.round(-tx.amount * 100)
  const detailed = tx.personal_finance_category?.detailed ?? ''
  const isWages = detailed === 'INCOME_WAGES' || (tx.counterparties ?? []).some((c) => c.type === 'income_source')
  const ownTransfer = detailed === 'TRANSFER_IN_ACCOUNT_TRANSFER'

  if (!ctx.collectFrom || new Date(`${tx.date}T23:59:59Z`) < ctx.collectFrom) return { status: 'history', reason: 'before_start' }
  if (amountCents < MIN_DEPOSIT_CENTS) return { status: 'ignored', reason: 'too_small' }
  if (ownTransfer) return { status: 'ignored', reason: 'own_transfer' }

  let decision: { status: DepositClass; reason: DepositReason }
  if (ctx.tenant.employment.selfEmployed) decision = { status: 'queued', reason: 'self_employed' }
  else if (isWages) decision = { status: 'queued', reason: 'wages' }
  else if (AUTO_COLLECT_NON_WAGE_WHEN_OWING && ctx.owes) decision = { status: 'queued', reason: 'owing' }
  else decision = { status: 'review', reason: 'not_wages' }

  if (decision.status === 'queued') {
    if (daysAgo(tx.date) > MAX_DEPOSIT_AGE_DAYS) return { status: 'review', reason: 'too_old' }
    if (splitDeposit(ctx.tenant, amountCents).baseCents > ctx.rangeMaxCents) return { status: 'review', reason: 'over_range' }
  }
  return decision
}

// ---- Sync (Plaid → deposits) -------------------------------------------------------

/** Short-lived per-Item lock so a webhook and the cron never sync the same Item at once. */
async function withItemLock<T>(itemId: string, fn: () => Promise<T>): Promise<T | 'locked'> {
  const db = await getDb()
  const locks = db.collection<{ _id: string; expiresAt: Date }>('locks')
  const id = `paycheck-sync:${itemId}`
  const now = new Date()
  try {
    // Take a free lock, or steal an expired one (crashed run). Fails on a live lock.
    await locks.updateOne(
      { _id: id, expiresAt: { $lt: now } },
      { $set: { expiresAt: new Date(now.getTime() + 2 * 60_000) } },
      { upsert: true },
    )
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) return 'locked'
    throw err
  }
  try {
    return await fn()
  } finally {
    await locks.deleteOne({ _id: id })
  }
}

function payerName(tx: Transaction): string | undefined {
  const cp = (tx.counterparties ?? []).find((c) => c.type === 'income_source') ?? tx.counterparties?.[0]
  return (cp?.name ?? tx.merchant_name ?? tx.name ?? undefined)?.slice(0, 120)
}

/**
 * Pull new transactions for a tenant's linked bank and record qualifying inflows.
 * Then try to collect anything queued. Safe to call repeatedly (webhook + cron).
 */
export async function syncTenantDeposits(tenantId: string): Promise<{ added: number; queued: number } | 'locked' | 'skipped'> {
  const tenant = await getTenantById(tenantId)
  const link = tenant?.bankLink
  if (!tenant || !link || link.status !== 'active') return 'skipped'

  return withItemLock(link.itemId, async () => {
    const accessToken = decryptString(link.accessTokenEnc)
    const { added, modified, removed, nextCursor } = await syncAllTransactions(accessToken, link.cursor)
    const col = await depositsCollection()
    const owes = await tenantOwes(tenant)
    const collectFrom = tenant.paycheck?.collectFrom ? new Date(tenant.paycheck.collectFrom) : null
    const rangeMaxCents = tenant.paycheckAuthorization?.rangeMaxCents ?? defaultRangeMaxCents(tenant)

    let addedCount = 0
    let queued = 0
    for (const tx of [...added, ...modified]) {
      // Posted inflows on the linked account only. Pending rows can still change.
      if (tx.account_id !== link.accountId || tx.pending || tx.amount >= 0) continue
      const decision = classifyDeposit(tx, { tenant, owes, collectFrom, rangeMaxCents })
      const now = new Date()
      const res = await col.updateOne(
        { plaidTransactionId: tx.transaction_id },
        {
          $setOnInsert: {
            _id: new ObjectId(),
            tenantId: new ObjectId(tenant.id),
            plaidTransactionId: tx.transaction_id,
            accountId: tx.account_id,
            amountCents: Math.round(-tx.amount * 100),
            date: tx.date,
            payer: payerName(tx),
            category: tx.personal_finance_category?.detailed ?? undefined,
            status: decision.status,
            reason: decision.reason,
            createdAt: now,
          },
          $set: { updatedAt: now },
        },
        { upsert: true },
      )
      if (res.upsertedCount === 1) {
        addedCount++
        if (decision.status === 'queued') queued++
      }
      // A posted transaction replacing its pending row: drop the old pending id if we ever stored it.
      if (tx.pending_transaction_id) {
        await col.updateOne(
          { plaidTransactionId: tx.pending_transaction_id, status: { $in: ['history', 'review', 'ignored'] } },
          { $set: { status: 'removed', updatedAt: now } },
        )
      }
    }
    await markRemoved(col, removed)
    await setBankCursor(tenant.id, nextCursor)

    await collectQueuedForTenant(tenant.id)
    return { added: addedCount, queued }
  })
}

async function markRemoved(col: Collection<DepositDoc>, removed: RemovedTransaction[]): Promise<void> {
  const ids = removed.map((r) => r.transaction_id).filter(Boolean) as string[]
  if (ids.length === 0) return
  // Only rows we haven't started collecting; a collected one stays (money already moved).
  await col.updateMany(
    { plaidTransactionId: { $in: ids }, status: { $in: ['history', 'ignored', 'review', 'queued'] } },
    { $set: { status: 'removed', updatedAt: new Date() } },
  )
}

/** Webhook entry point: Plaid says an Item has new transactions. */
export async function syncByPlaidItem(itemId: string): Promise<void> {
  const tenant = await getTenantByBankItem(itemId)
  if (!tenant) {
    logWarn('paychecks/sync', 'webhook for unknown bank item', { itemId })
    return
  }
  const result = await syncTenantDeposits(tenant.id)
  if (result === 'locked') logWarn('paychecks/sync', 'sync already running', { tenantId: tenant.id })
}

// ---- Collection (deposit → Stripe debit) ---------------------------------------------

/** Why a tenant can't be debited right now (null = OK). Checked before every debit. */
async function collectionBlocker(tenant: Tenant): Promise<string | null> {
  if (!paycheckCollectionEnabled()) return 'feature disabled'
  if (tenant.status !== 'approved') return 'tenant not approved'
  if (tenant.paycheck?.status !== 'active') return 'paycheck mode not active'
  if (!tenant.paycheckAuthorization) return 'no authorization'
  if (tenant.bankLink?.status !== 'active') return 'bank connection needs attention'
  if (!tenant.stripeCustomerId || !tenant.defaultPaymentMethodId) return 'no saved payment method'
  const bank = await getBankAccountLast4(tenant.defaultPaymentMethodId)
  if (!bank) return 'saved payment method is not a bank account'
  if (tenant.bankLink.mask && bank.last4 !== tenant.bankLink.mask && !accountMismatchAllowedForTesting()) {
    return 'Stripe account does not match the linked bank'
  }
  return null
}

export async function collectQueuedForTenant(tenantId: string): Promise<void> {
  const col = await depositsCollection()
  const queued = await col.find({ tenantId: new ObjectId(tenantId), status: 'queued' }).sort({ date: 1 }).limit(10).toArray()
  for (const d of queued) await collectDeposit(d._id.toString())
}

/**
 * Debit the program share of one queued deposit. Atomic claim first, so two
 * concurrent runs can't both debit; Stripe idempotency covers retries.
 */
export async function collectDeposit(depositId: string): Promise<'started' | 'blocked' | 'not_queued' | 'failed'> {
  const col = await depositsCollection()
  const claimed = await col.findOneAndUpdate(
    { _id: new ObjectId(depositId), status: 'queued' },
    { $set: { status: 'collecting', updatedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!claimed) return 'not_queued'

  const tenant = await getTenantById(claimed.tenantId.toString())
  const blocker = tenant ? await collectionBlocker(tenant) : 'tenant missing'
  if (!tenant || blocker) {
    // Put it back; it will be collected once the blocker clears (e.g. relink, resume).
    await col.updateOne({ _id: claimed._id }, { $set: { status: 'queued', updatedAt: new Date() } })
    logWarn('paychecks/collect', `deposit held: ${blocker}`, { depositId, tenantId: claimed.tenantId.toString() })
    return 'blocked'
  }

  const { rentCents, carCents, baseCents } = splitDeposit(tenant, claimed.amountCents)
  const chargedCents = withProcessingFee(baseCents)
  const attempt = (claimed.collection?.attempt ?? 0) + 1
  try {
    const pi = await createPaycheckPaymentIntent({
      customerId: tenant.stripeCustomerId!,
      paymentMethodId: tenant.defaultPaymentMethodId!,
      amountCents: chargedCents,
      metadata: {
        type: 'paycheck_collection',
        tenantId: tenant.id,
        depositId,
        program: programOf(tenant),
        rentCents: String(rentCents),
        carCents: String(carCents),
      },
      idempotencyKey: `paycheck:${claimed.plaidTransactionId}:${attempt}`,
    })
    await col.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: pi.status === 'succeeded' ? 'collected' : 'processing',
          collection: { attempt, paymentIntentId: pi.id, rentCents, carCents, chargedCents, initiatedAt: new Date() },
          updatedAt: new Date(),
        },
      },
    )
    try {
      await sendPaycheckCollectionEmail({
        to: tenant.email,
        name: tenant.name,
        depositAmount: formatCents(claimed.amountCents),
        depositDate: claimed.date,
        percent: `${pct(PROGRAMS[programOf(tenant)].rentRate + PROGRAMS[programOf(tenant)].carRate)}%`,
        breakdown: rateSummary(programOf(tenant)),
        charged: formatCents(chargedCents),
        accountMask: tenant.bankLink?.mask,
      })
    } catch (err) {
      logError('paychecks/receipt-email', err, { depositId })
    }
    return 'started'
  } catch (err) {
    logError('paychecks/create-debit', err, { depositId, tenantId: tenant.id })
    const code = (err as { code?: string; decline_code?: string }).decline_code ?? (err as { code?: string }).code
    await col.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: 'failed',
          collection: { attempt, rentCents, carCents, chargedCents, failureCode: code ?? 'stripe_error', initiatedAt: new Date() },
          updatedAt: new Date(),
        },
      },
    )
    return 'failed'
  }
}

// ---- Stripe outcomes (called from app/api/stripe/webhook) -------------------------------

async function depositForIntent(pi: Stripe.PaymentIntent): Promise<DepositDoc | null> {
  const col = await depositsCollection()
  const byPi = await col.findOne({ 'collection.paymentIntentId': pi.id })
  if (byPi) return byPi
  const id = pi.metadata?.depositId
  return id && ObjectId.isValid(id) ? col.findOne({ _id: new ObjectId(id) }) : null
}

export async function markCollectionProcessing(pi: Stripe.PaymentIntent): Promise<void> {
  const d = await depositForIntent(pi)
  if (!d) return
  const col = await depositsCollection()
  await col.updateOne(
    { _id: d._id, status: { $in: ['collecting', 'processing'] } },
    { $set: { status: 'processing', 'collection.paymentIntentId': pi.id, updatedAt: new Date() } },
  )
}

/** Money arrived: book it (equity or ledger) exactly like a paid invoice. Idempotent on the PI id. */
export async function markCollectionSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
  const d = await depositForIntent(pi)
  if (!d) {
    logWarn('paychecks/succeeded', 'no deposit for payment intent', { paymentIntentId: pi.id })
    return
  }
  const tenant = await getTenantById(d.tenantId.toString())
  if (!tenant) return
  // Amounts from the PI metadata our server wrote (signature-verified event), not the current record.
  const rentCents = Number(pi.metadata.rentCents ?? d.collection?.rentCents ?? 0)
  const carCents = Number(pi.metadata.carCents ?? d.collection?.carCents ?? 0)
  await recordTenantPayment({ tenant, ref: `pi:${pi.id}`, rentCents, carCents, paidAt: new Date() })
  const col = await depositsCollection()
  await col.updateOne(
    { _id: d._id },
    { $set: { status: 'collected', 'collection.paymentIntentId': pi.id, 'collection.completedAt': new Date(), updatedAt: new Date() } },
  )
}

export async function markCollectionFailed(pi: Stripe.PaymentIntent): Promise<void> {
  const d = await depositForIntent(pi)
  if (!d) return
  const code = pi.last_payment_error?.decline_code ?? pi.last_payment_error?.code ?? 'payment_failed'
  const col = await depositsCollection()
  const res = await col.updateOne(
    { _id: d._id, status: { $ne: 'failed' } },
    { $set: { status: 'failed', 'collection.failureCode': code, 'collection.completedAt': new Date(), updatedAt: new Date() } },
  )
  if (res.modifiedCount !== 1) return // already handled (webhook retry)
  const tenant = await getTenantById(d.tenantId.toString())
  if (!tenant) return
  try {
    await sendPaycheckFailedEmail({
      to: tenant.email,
      name: tenant.name,
      charged: formatCents(d.collection?.chargedCents ?? pi.amount),
      reason: code.replace(/_/g, ' '),
    })
  } catch (err) {
    logError('paychecks/failed-email', err, { tenantId: tenant.id })
  }
}

/** A disputed paycheck debit invalidates the mandate → stop paycheck collection for that tenant. */
export async function handleCollectionDispute(dispute: Stripe.Dispute): Promise<void> {
  const piId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id
  if (!piId) return
  const col = await depositsCollection()
  const d = await col.findOne({ 'collection.paymentIntentId': piId })
  if (!d) return // not a paycheck collection
  await pausePaycheckMode(d.tenantId.toString(), `Debit disputed (${dispute.reason}) — mandate no longer valid`)
  logWarn('paychecks/dispute', 'paycheck debit disputed; paycheck mode paused', { tenantId: d.tenantId.toString() })
}

// ---- Admin decisions --------------------------------------------------------------------

/** Admin includes a 'review' deposit (or retries a failed one) → queued → collect now. */
export async function includeDeposit(depositId: string): Promise<'started' | 'blocked' | 'not_queued' | 'failed' | 'invalid'> {
  if (!ObjectId.isValid(depositId)) return 'invalid'
  const col = await depositsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(depositId), status: { $in: ['review', 'failed', 'ignored'] } },
    { $set: { status: 'queued', reason: 'admin_include', decidedAt: new Date(), updatedAt: new Date() } },
  )
  if (res.modifiedCount !== 1) return 'invalid'
  return collectDeposit(depositId)
}

export async function ignoreDeposit(depositId: string): Promise<boolean> {
  if (!ObjectId.isValid(depositId)) return false
  const col = await depositsCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(depositId), status: { $in: ['review', 'queued', 'failed'] } },
    { $set: { status: 'ignored', reason: 'admin_ignore', decidedAt: new Date(), updatedAt: new Date() } },
  )
  return res.modifiedCount === 1
}

export async function getDepositTenantId(depositId: string): Promise<string | null> {
  if (!ObjectId.isValid(depositId)) return null
  const col = await depositsCollection()
  const d = await col.findOne({ _id: new ObjectId(depositId) }, { projection: { tenantId: 1 } })
  return d ? d.tenantId.toString() : null
}
