'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/dal'
import { findPartnerById } from '@/lib/users'
import { getStripe, withProcessingFee } from '@/lib/stripe'
import { rateLimit, getClientIp } from '@/lib/ratelimit'
import {
  sendProjectInvoiceEmail,
  sendFinalInvoiceEmail,
  sendBalanceDueEmail,
} from '@/lib/email'
import {
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getInvoiceById,
  getInvoiceByToken,
  markInvoiceSent,
  markInvoiceAccepted,
  markInvoiceDeclined,
  markInvoiceCompleted,
  addInvoiceSession,
  hasOutstandingBalance,
  type Invoice,
  type InvoiceInput,
  type LineItem,
  type PaymentPhase,
} from '@/lib/invoices'

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

// Throttle the public (unauthenticated) token endpoints per IP.
const TOKEN_LIMIT = 20
const TOKEN_WINDOW_MS = 60 * 1000

export type InvoiceFormState =
  | { error?: string; errors?: Record<string, string>; values?: Record<string, string> }
  | undefined

/** Line items arrive as JSON from the client builder: label, qty, unit price in dollars. */
function parseLineItems(raw: string): LineItem[] {
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .map((li) => ({
        label: String(li?.label ?? '').trim(),
        quantity: Math.max(1, Math.floor(Number(li?.quantity) || 1)),
        unitCents: Math.max(0, Math.round((Number(li?.unitDollars) || 0) * 100)),
      }))
      .filter((li) => li.label && li.unitCents > 0)
  } catch {
    return []
  }
}

/** Photo URLs arrive as a JSON array of Vercel Blob URLs. */
function parseUrls(raw: string): string[] {
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u))
  } catch {
    return []
  }
}

/**
 * Build (and validate) the invoice input from the form. Resolves the recipient
 * from a selected partner, or from typed-in demographics when there's no account.
 */
async function readInvoiceInput(
  formData: FormData,
): Promise<{ ok: true; input: InvoiceInput } | { ok: false; state: InvoiceFormState }> {
  const get = (k: string) => String(formData.get(k) ?? '').trim()
  const values: Record<string, string> = {
    title: get('title'),
    description: get('description'),
    timeline: get('timeline'),
    name: get('name'),
    email: get('email'),
    phone: get('phone'),
    partnerId: get('partnerId'),
  }
  const errors: Record<string, string> = {}

  if (!values.title) errors.title = 'Enter a project title.'
  if (!values.description) errors.description = 'Describe the work.'
  if (!values.timeline) errors.timeline = 'Enter a timeline.'

  const lineItems = parseLineItems(get('lineItems'))
  if (lineItems.length === 0) errors.lineItems = 'Add at least one line item with a cost.'

  const proposedPhotoUrls = parseUrls(get('proposedPhotoUrls'))

  let recipient: InvoiceInput['recipient']
  if (values.partnerId) {
    const partner = await findPartnerById(values.partnerId)
    if (!partner) {
      return { ok: false, state: { error: 'Selected partner was not found.', values } }
    }
    recipient = { partnerId: partner.id, name: partner.name, email: partner.email, phone: partner.phone }
  } else {
    if (!values.name) errors.name = 'Enter the recipient’s name.'
    if (!values.email) errors.email = 'Enter an email.'
    else if (!emailRe.test(values.email)) errors.email = 'Enter a valid email.'
    recipient = { name: values.name, email: values.email, phone: values.phone || undefined }
  }

  if (Object.keys(errors).length > 0) return { ok: false, state: { errors, values } }

  return {
    ok: true,
    input: {
      recipient,
      title: values.title,
      description: values.description,
      timeline: values.timeline,
      lineItems,
      proposedPhotoUrls,
    },
  }
}

// ---- Admin: create / edit ----

export async function createInvoiceAction(
  _prev: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  await requireRole('admin', '/admin/login')

  const parsed = await readInvoiceInput(formData)
  if (!parsed.ok) return parsed.state
  const { input } = parsed

  // Fair-billing rule: no new project may start while a balance is outstanding.
  if (await hasOutstandingBalance({ partnerId: input.recipient.partnerId, email: input.recipient.email })) {
    return {
      error: 'This recipient has an unpaid balance on an active project. Balances must be paid before starting a new one.',
      values: { title: input.title, description: input.description, timeline: input.timeline },
    }
  }

  const intent = String(formData.get('intent') ?? 'draft')
  const invoice = await createInvoice(input)

  let emailOk = true
  if (intent === 'send') {
    await markInvoiceSent(invoice.id)
    try {
      await sendProjectInvoiceEmail(invoice)
    } catch {
      emailOk = false
    }
  }

  revalidatePath('/admin/invoices')
  redirect(`/admin/invoices/${invoice.id}?${intent === 'send' ? (emailOk ? 'sent=1' : 'email=failed') : 'saved=1'}`)
}

export async function updateInvoiceAction(
  _prev: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  const existing = await getInvoiceById(id)
  if (!existing) redirect('/admin/invoices')

  const parsed = await readInvoiceInput(formData)
  if (!parsed.ok) return parsed.state

  await updateInvoice(id, parsed.input)

  const intent = String(formData.get('intent') ?? 'save')
  let emailOk = true
  if (intent === 'resubmit') {
    const updated = await getInvoiceById(id)
    if (updated) {
      // An already-accepted invoice re-sends the payable final invoice; a sent or
      // declined one re-sends the proposal (and returns to the "sent" state).
      try {
        if (updated.status === 'accepted') {
          await sendFinalInvoiceEmail(updated)
        } else {
          await markInvoiceSent(id)
          await sendProjectInvoiceEmail(updated)
        }
      } catch {
        emailOk = false
      }
    }
  }

  revalidatePath('/admin/invoices')
  revalidatePath(`/admin/invoices/${id}`)
  redirect(`/admin/invoices/${id}?${intent === 'resubmit' ? (emailOk ? 'sent=1' : 'email=failed') : 'saved=1'}`)
}

// ---- Admin: fire-and-redirect actions from the detail page ----

export async function sendInvoiceAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  const invoice = await getInvoiceById(id)
  if (!invoice) redirect('/admin/invoices')

  await markInvoiceSent(id)
  let emailOk = true
  try {
    await sendProjectInvoiceEmail(invoice!)
  } catch {
    emailOk = false
  }
  revalidatePath(`/admin/invoices/${id}`)
  redirect(`/admin/invoices/${id}?${emailOk ? 'sent=1' : 'email=failed'}`)
}

export async function sendFinalInvoiceAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  const invoice = await getInvoiceById(id)
  if (!invoice) redirect('/admin/invoices')

  let emailOk = true
  try {
    await sendFinalInvoiceEmail(invoice!)
  } catch {
    emailOk = false
  }
  revalidatePath(`/admin/invoices/${id}`)
  redirect(`/admin/invoices/${id}?${emailOk ? 'sent=1' : 'email=failed'}`)
}

export async function deleteInvoiceAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  await deleteInvoice(id)
  revalidatePath('/admin/invoices')
  redirect('/admin/invoices?deleted=1')
}

export async function markCompletedAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  const finishedPhotoUrl = String(formData.get('finishedPhotoUrl') ?? '').trim()
  if (!/^https?:\/\//.test(finishedPhotoUrl)) {
    redirect(`/admin/invoices/${id}?error=photo`)
  }

  const ok = await markInvoiceCompleted(id, finishedPhotoUrl)
  if (!ok) redirect(`/admin/invoices/${id}?error=state`)

  // Request the remaining balance (if any) with the finished-work photo attached.
  const invoice = await getInvoiceById(id)
  let emailOk = true
  if (invoice && invoice.payment.status !== 'paid') {
    try {
      await sendBalanceDueEmail(invoice)
    } catch {
      emailOk = false
    }
  }
  revalidatePath('/admin/invoices')
  revalidatePath(`/admin/invoices/${id}`)
  redirect(`/admin/invoices/${id}?${emailOk ? 'completed=1' : 'email=failed'}`)
}

// ---- Public (token-based, no login) ----

async function throttle(token: string): Promise<boolean> {
  const ip = await getClientIp()
  const { allowed } = await rateLimit({ key: `invoice:${ip}:${token}`, limit: TOKEN_LIMIT, windowMs: TOKEN_WINDOW_MS })
  return allowed
}

export async function acceptInvoiceByToken(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '')
  if (!(await throttle(token))) redirect(`/invoices/${token}?error=throttled`)

  const invoice = await markInvoiceAccepted(token)
  if (invoice) {
    try {
      await sendFinalInvoiceEmail(invoice)
    } catch {
      /* the pay options are on the page regardless — don't block acceptance */
    }
  }
  revalidatePath(`/invoices/${token}`)
  redirect(`/invoices/${token}?accepted=1`)
}

export async function declineInvoiceByToken(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '')
  if (!(await throttle(token))) redirect(`/invoices/${token}?error=throttled`)

  const note = String(formData.get('note') ?? '')
  await markInvoiceDeclined(token, note)
  revalidatePath(`/invoices/${token}`)
  redirect(`/invoices/${token}?declined=1`)
}

/**
 * Start a Stripe Checkout for one payment phase. The partner covers the
 * processing fee (app convention). The chosen phase decides the amount:
 *  - full:    whole project total (only if nothing is paid yet)
 *  - deposit: 50% up front
 *  - balance: whatever remains
 */
export async function startInvoicePaymentByToken(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '')
  if (!(await throttle(token))) redirect(`/invoices/${token}?error=throttled`)

  const phase = String(formData.get('phase') ?? '') as PaymentPhase
  const invoice = await getInvoiceByToken(token)
  if (!invoice || (invoice.status !== 'accepted' && invoice.status !== 'completed')) {
    redirect(`/invoices/${token}`)
  }

  if (invoice!.payment.status === 'paid') redirect(`/invoices/${token}?error=paid`)

  const remainingCents = Math.max(0, invoice!.subtotalCents - invoice!.payment.paidCents)
  let amountCents: number
  if (phase === 'full') amountCents = remainingCents
  else if (phase === 'deposit') amountCents = invoice!.payment.status === 'unpaid' ? invoice!.payment.depositCents : remainingCents
  else if (phase === 'balance') amountCents = remainingCents
  else redirect(`/invoices/${token}`)

  if (amountCents! <= 0) redirect(`/invoices/${token}?error=paid`)

  // Keep the Stripe call and redirect(session.url) out of any try so the
  // redirect isn't swallowed (redirect throws internally).
  const url = await createInvoiceCheckout(invoice!, phase, amountCents!)
  redirect(url)
}

/** Create a Checkout session for a phase and record it on the invoice. */
async function createInvoiceCheckout(invoice: Invoice, phase: PaymentPhase, amountCents: number): Promise<string> {
  const stripe = getStripe()
  const label = phase === 'full' ? 'payment in full' : phase === 'deposit' ? '50% deposit' : 'balance'
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: invoice.recipient.email,
    payment_method_types: ['us_bank_account', 'card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: withProcessingFee(amountCents),
          product_data: {
            name: `${invoice.title} — ${label}`,
            description: 'Includes card/bank processing fee.',
          },
        },
      },
    ],
    metadata: { type: 'project_invoice', invoiceId: invoice.id, phase },
    payment_intent_data: { metadata: { type: 'project_invoice', invoiceId: invoice.id, phase } },
    success_url: `${baseUrl}/invoices/${invoice.token}/paid?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/invoices/${invoice.token}?canceled=1`,
  })
  await addInvoiceSession(invoice.id, session.id, phase)
  return session.url as string
}
