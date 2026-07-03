import 'server-only'

import { ObjectId, type Collection, type Filter } from 'mongodb'
import { randomBytes } from 'node:crypto'
import { getDb } from './mongodb'

/**
 * Project invoices — admins propose paid work to a property partner (or a
 * prospect who has no account yet). The recipient opens a tokenized link (no
 * login) to accept/decline, then pays in full or a 50% deposit up front with the
 * balance due on completion. Money is integer cents throughout (app convention).
 */

export type InvoiceStatus = 'draft' | 'sent' | 'declined' | 'accepted' | 'completed'
export type PaymentStatus = 'unpaid' | 'deposit_paid' | 'paid'
export type PaymentPlan = 'full' | 'split'
/** Which slice of the total a given Checkout session collects. */
export type PaymentPhase = 'full' | 'deposit' | 'balance'

export interface LineItem {
  label: string
  quantity: number
  unitCents: number
}

export interface InvoiceSession {
  id: string
  phase: PaymentPhase
  paid: boolean
}

export interface InvoicePayment {
  status: PaymentStatus
  plan?: PaymentPlan
  depositCents: number
  balanceCents: number
  paidCents: number
  sessions: InvoiceSession[]
}

interface InvoiceRecipientDoc {
  partnerId?: ObjectId
  name: string
  email: string
  phone?: string
}

export interface InvoiceDoc {
  _id: ObjectId
  /** High-entropy public capability link — the only handle the recipient gets. */
  token: string
  recipient: InvoiceRecipientDoc
  title: string
  description: string
  timeline: string
  lineItems: LineItem[]
  subtotalCents: number
  proposedPhotoUrls: string[]
  finishedPhotoUrl?: string
  status: InvoiceStatus
  declineNote?: string
  payment: InvoicePayment
  createdAt: Date
  updatedAt: Date
  sentAt?: Date
  acceptedAt?: Date
  declinedAt?: Date
  completedAt?: Date
}

export type InvoiceRecipient = { partnerId?: string; name: string; email: string; phone?: string }

/** Serializable shape for Client Components — no ObjectId, no ciphertext. */
export type Invoice = {
  id: string
  token: string
  recipient: InvoiceRecipient
  title: string
  description: string
  timeline: string
  lineItems: LineItem[]
  subtotalCents: number
  proposedPhotoUrls: string[]
  finishedPhotoUrl?: string
  status: InvoiceStatus
  declineNote?: string
  payment: InvoicePayment
  createdAt: Date
  updatedAt: Date
  sentAt?: Date
  acceptedAt?: Date
  declinedAt?: Date
  completedAt?: Date
}

export interface InvoiceInput {
  recipient: { partnerId?: string; name: string; email: string; phone?: string }
  title: string
  description: string
  timeline: string
  lineItems: LineItem[]
  proposedPhotoUrls: string[]
}

async function invoicesCollection(): Promise<Collection<InvoiceDoc>> {
  const db = await getDb()
  const col = db.collection<InvoiceDoc>('invoices')
  await col.createIndex({ token: 1 }, { unique: true })
  await col.createIndex({ status: 1, createdAt: -1 })
  await col.createIndex({ 'recipient.partnerId': 1 })
  await col.createIndex({ 'recipient.email': 1 })
  return col
}

function toInvoice(d: InvoiceDoc): Invoice {
  return {
    id: d._id.toString(),
    token: d.token,
    recipient: {
      partnerId: d.recipient.partnerId?.toString(),
      name: d.recipient.name,
      email: d.recipient.email,
      phone: d.recipient.phone,
    },
    title: d.title,
    description: d.description,
    timeline: d.timeline,
    lineItems: d.lineItems,
    subtotalCents: d.subtotalCents,
    proposedPhotoUrls: d.proposedPhotoUrls,
    finishedPhotoUrl: d.finishedPhotoUrl,
    status: d.status,
    declineNote: d.declineNote,
    payment: d.payment,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    sentAt: d.sentAt,
    acceptedAt: d.acceptedAt,
    declinedAt: d.declinedAt,
    completedAt: d.completedAt,
  }
}

/** Sum of line items, in cents. Guards against NaN / negative quantities. */
export function subtotalOf(lineItems: LineItem[]): number {
  return lineItems.reduce((sum, li) => {
    const qty = Math.max(0, Math.floor(li.quantity || 0))
    const unit = Math.max(0, Math.round(li.unitCents || 0))
    return sum + qty * unit
  }, 0)
}

/** The 50%-upfront split. Deposit rounds up so it's never short of half. */
function splitOf(subtotalCents: number): { depositCents: number; balanceCents: number } {
  const depositCents = Math.round(subtotalCents / 2)
  return { depositCents, balanceCents: subtotalCents - depositCents }
}

function newToken(): string {
  return randomBytes(24).toString('hex')
}

// ---- Create / read ----

export async function createInvoice(input: InvoiceInput): Promise<Invoice> {
  const col = await invoicesCollection()
  const now = new Date()
  const subtotalCents = subtotalOf(input.lineItems)
  const { depositCents, balanceCents } = splitOf(subtotalCents)

  const recipient: InvoiceRecipientDoc = {
    name: input.recipient.name.trim(),
    email: input.recipient.email.toLowerCase().trim(),
  }
  if (input.recipient.partnerId && ObjectId.isValid(input.recipient.partnerId)) {
    recipient.partnerId = new ObjectId(input.recipient.partnerId)
  }
  if (input.recipient.phone?.trim()) recipient.phone = input.recipient.phone.trim()

  const doc: InvoiceDoc = {
    _id: new ObjectId(),
    token: newToken(),
    recipient,
    title: input.title.trim(),
    description: input.description.trim(),
    timeline: input.timeline.trim(),
    lineItems: input.lineItems,
    subtotalCents,
    proposedPhotoUrls: input.proposedPhotoUrls,
    status: 'draft',
    payment: { status: 'unpaid', depositCents, balanceCents, paidCents: 0, sessions: [] },
    createdAt: now,
    updatedAt: now,
  }
  await col.insertOne(doc)
  return toInvoice(doc)
}

export async function listAllInvoices(): Promise<Invoice[]> {
  const col = await invoicesCollection()
  const docs = await col.find({}).sort({ createdAt: -1 }).toArray()
  return docs.map(toInvoice)
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  if (!ObjectId.isValid(id)) return null
  const col = await invoicesCollection()
  const doc = await col.findOne({ _id: new ObjectId(id) })
  return doc ? toInvoice(doc) : null
}

export async function getInvoiceByToken(token: string): Promise<Invoice | null> {
  if (!token || token.length < 16) return null
  const col = await invoicesCollection()
  const doc = await col.findOne({ token })
  return doc ? toInvoice(doc) : null
}

// ---- Edit ----

/** Edit an invoice's content and recompute money. Leaves status/payment intact. */
export async function updateInvoice(
  id: string,
  input: InvoiceInput,
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await invoicesCollection()
  const doc = await col.findOne({ _id: new ObjectId(id) })
  if (!doc) return false

  const subtotalCents = subtotalOf(input.lineItems)
  const { depositCents, balanceCents } = splitOf(subtotalCents)

  const recipient: InvoiceRecipientDoc = {
    name: input.recipient.name.trim(),
    email: input.recipient.email.toLowerCase().trim(),
  }
  if (input.recipient.partnerId && ObjectId.isValid(input.recipient.partnerId)) {
    recipient.partnerId = new ObjectId(input.recipient.partnerId)
  }
  if (input.recipient.phone?.trim()) recipient.phone = input.recipient.phone.trim()

  const payment: InvoicePayment = { ...doc.payment, depositCents, balanceCents }

  const res = await col.updateOne(
    { _id: doc._id },
    {
      $set: {
        recipient,
        title: input.title.trim(),
        description: input.description.trim(),
        timeline: input.timeline.trim(),
        lineItems: input.lineItems,
        subtotalCents,
        proposedPhotoUrls: input.proposedPhotoUrls,
        payment,
        updatedAt: new Date(),
      },
    },
  )
  return res.matchedCount === 1
}

export async function deleteInvoice(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await invoicesCollection()
  const res = await col.deleteOne({ _id: new ObjectId(id) })
  return res.deletedCount === 1
}

// ---- Status transitions ----

export async function markInvoiceSent(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await invoicesCollection()
  const res = await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: 'sent', sentAt: new Date(), updatedAt: new Date() } },
  )
  return res.matchedCount === 1
}

export async function markInvoiceAccepted(token: string): Promise<Invoice | null> {
  const col = await invoicesCollection()
  const now = new Date()
  const doc = await col.findOneAndUpdate(
    { token, status: 'sent' },
    { $set: { status: 'accepted', acceptedAt: now, updatedAt: now }, $unset: { declineNote: '' } },
    { returnDocument: 'after' },
  )
  return doc ? toInvoice(doc) : null
}

export async function markInvoiceDeclined(token: string, note: string): Promise<boolean> {
  const col = await invoicesCollection()
  const now = new Date()
  const set: Partial<InvoiceDoc> = { status: 'declined', declinedAt: now, updatedAt: now }
  if (note.trim()) set.declineNote = note.trim()
  const res = await col.updateOne({ token, status: 'sent' }, { $set: set })
  return res.modifiedCount === 1
}

export async function markInvoiceCompleted(id: string, finishedPhotoUrl: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await invoicesCollection()
  const now = new Date()
  const res = await col.updateOne(
    { _id: new ObjectId(id), status: 'accepted' },
    { $set: { status: 'completed', finishedPhotoUrl, completedAt: now, updatedAt: now } },
  )
  return res.modifiedCount === 1
}

// ---- Payments ----

/** Register a freshly-created Checkout session on the invoice (before payment). */
export async function addInvoiceSession(id: string, sessionId: string, phase: PaymentPhase): Promise<void> {
  if (!ObjectId.isValid(id)) return
  const col = await invoicesCollection()
  const doc = await col.findOne({ _id: new ObjectId(id) })
  if (!doc) return
  const sessions = doc.payment.sessions.filter((s) => s.id !== sessionId)
  sessions.push({ id: sessionId, phase, paid: false })
  const payment: InvoicePayment = { ...doc.payment, plan: phase === 'full' ? 'full' : 'split', sessions }
  await col.updateOne({ _id: doc._id }, { $set: { payment, updatedAt: new Date() } })
}

/**
 * Mark a Checkout session paid (or not) and recompute the invoice's payment
 * status. Idempotent and keyed on the session id, so replaying the webhook and
 * the success-page reconciliation both converge on the same result.
 */
export async function recordInvoicePayment(
  id: string,
  sessionId: string,
  phase: PaymentPhase,
  paid: boolean,
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const col = await invoicesCollection()
  const doc = await col.findOne({ _id: new ObjectId(id) })
  if (!doc) return false

  const sessions = [...doc.payment.sessions]
  const existing = sessions.find((s) => s.id === sessionId)
  if (existing) existing.paid = existing.paid || paid
  else sessions.push({ id: sessionId, phase, paid })

  const fullPaid = sessions.some((s) => s.phase === 'full' && s.paid)
  const depositPaid = sessions.some((s) => s.phase === 'deposit' && s.paid)
  const balancePaid = sessions.some((s) => s.phase === 'balance' && s.paid)

  const paidCents = fullPaid
    ? doc.subtotalCents
    : (depositPaid ? doc.payment.depositCents : 0) + (balancePaid ? doc.payment.balanceCents : 0)

  const status: PaymentStatus =
    doc.subtotalCents > 0 && paidCents >= doc.subtotalCents ? 'paid' : paidCents > 0 ? 'deposit_paid' : 'unpaid'

  const payment: InvoicePayment = { ...doc.payment, status, paidCents, sessions }
  await col.updateOne({ _id: doc._id }, { $set: { payment, updatedAt: new Date() } })
  return true
}

// ---- Business-rule guard ----

/**
 * True if this recipient already has an active project with money still owed —
 * used to block a new invoice ("no new project may start until balances are
 * paid"). Matches an accepted/completed invoice whose payment isn't fully paid.
 */
export async function hasOutstandingBalance(recipient: { partnerId?: string; email?: string }): Promise<boolean> {
  const or: Record<string, unknown>[] = []
  if (recipient.partnerId && ObjectId.isValid(recipient.partnerId)) {
    or.push({ 'recipient.partnerId': new ObjectId(recipient.partnerId) })
  }
  if (recipient.email?.trim()) or.push({ 'recipient.email': recipient.email.toLowerCase().trim() })
  if (or.length === 0) return false

  const col = await invoicesCollection()
  const doc = await col.findOne({
    $or: or,
    status: { $in: ['accepted', 'completed'] },
    'payment.status': { $ne: 'paid' },
  } as Filter<InvoiceDoc>)
  return doc !== null
}
