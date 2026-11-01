import 'server-only'

import Stripe from 'stripe'
import type { BillingFrequency, BillingStatus } from './tenants'
import { logError } from './log'
import { withProcessingFee } from './fees'

let client: Stripe | null = null

/** Lazy Stripe client so `next build` doesn't require the secret key at import. */
export function getStripe(): Stripe {
  if (client) return client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY environment variable')
  client = new Stripe(key)
  return client
}

/** Base application fee, in cents. */
export const APPLICATION_FEE_CENTS = 2500

/** Share of a tenant's monthly income collected as rent. */
export const COLLECTION_RATE = 0.4

/** Effort Exchange: minimum verified hours worked per week. */
export const REQUIRED_WEEKLY_HOURS = 35

// Fee math lives in lib/fees.ts (client-safe) so admin form previews match the server.
export { STRIPE_PERCENT, STRIPE_FIXED_CENTS, withProcessingFee, processingFeeCents } from './fees'

/** Total the tenant is charged for the application fee, fee included. */
export function applicationTotalCents(): number {
  return withProcessingFee(APPLICATION_FEE_CENTS)
}

/**
 * Extract the subscription id from an invoice across Stripe API shapes (older
 * versions expose `subscription`, newer ones `parent.subscription_details`).
 * Shared by the webhook and the admin revenue view.
 */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const i = invoice as unknown as {
    subscription?: string | { id?: string }
    parent?: { subscription_details?: { subscription?: string } }
  }
  if (typeof i.subscription === 'string') return i.subscription
  if (i.subscription?.id) return i.subscription.id
  return i.parent?.subscription_details?.subscription
}

// ---- Importing an existing Stripe customer (admin add-tenant prefill) ----

/** Normalized view of a Stripe customer: demographics + their saved payment method. */
export type ImportedCustomer = {
  customerId: string
  name: string | null
  email: string | null
  phone: string | null
  address: { line1: string; line2: string; city: string; state: string; postalCode: string; country: string } | null
  defaultPaymentMethodId: string | null
  /** Human label for admin confidence, e.g. "visa •••• 4242" or "bank •••• 6789". */
  paymentMethodLabel: string | null
}

export type CustomerImportResult = { ok: true; data: ImportedCustomer } | { ok: false; error: string }

/**
 * Look up an existing Stripe customer by id and normalize it for the admin
 * add-tenant flow: demographics to prefill the application, plus the saved
 * payment method (their invoice default, else the most recently attached) so
 * rent can draft without the in-app fee checkout. Read-only.
 */
export async function fetchCustomerForImport(customerId: string): Promise<CustomerImportResult> {
  const id = customerId.trim()
  if (!id.startsWith('cus_')) return { ok: false, error: 'Enter a Stripe customer id (it starts with “cus_”).' }

  let customer: Stripe.Customer | Stripe.DeletedCustomer
  try {
    customer = await getStripe().customers.retrieve(id, { expand: ['invoice_settings.default_payment_method'] })
  } catch (err) {
    logError('stripe/import-customer-lookup', err)
    return { ok: false, error: 'No Stripe customer found for that id.' }
  }
  if (customer.deleted) return { ok: false, error: 'That Stripe customer was deleted in Stripe.' }

  let pm: Stripe.PaymentMethod | null =
    typeof customer.invoice_settings?.default_payment_method === 'object'
      ? customer.invoice_settings.default_payment_method
      : null
  if (!pm) {
    try {
      const list = await getStripe().customers.listPaymentMethods(id, { limit: 1 })
      pm = list.data[0] ?? null
    } catch (err) {
      logError('stripe/import-payment-methods', err)
      pm = null
    }
  }
  const paymentMethodLabel = pm
    ? pm.card
      ? `${pm.card.brand} •••• ${pm.card.last4}`
      : pm.us_bank_account
        ? `bank •••• ${pm.us_bank_account.last4}`
        : pm.type
    : null

  const a = customer.address
  return {
    ok: true,
    data: {
      customerId: customer.id,
      name: customer.name ?? null,
      email: customer.email ?? null,
      phone: customer.phone ?? null,
      address: a
        ? {
            line1: a.line1 ?? '',
            line2: a.line2 ?? '',
            city: a.city ?? '',
            state: a.state ?? '',
            postalCode: a.postal_code ?? '',
            country: a.country ?? '',
          }
        : null,
      defaultPaymentMethodId: pm?.id ?? null,
      paymentMethodLabel,
    },
  }
}

// ---- Importing manually-created subscriptions (one-off tenants) ----

/** Normalized view of an existing Stripe subscription, ready to record as billing. */
export type ImportedSubscription = {
  customerId: string
  customerEmail: string | null
  customerName: string | null
  amountCents: number
  frequency: BillingFrequency
  status: BillingStatus
  /** Next charge date (the subscription item's current period end). */
  nextDraftAt: Date
}

export type SubscriptionImportResult =
  | { ok: true; data: ImportedSubscription }
  | { ok: false; error: string }

/** Map a Stripe price recurrence to one of our supported draft frequencies. */
function mapInterval(interval: string, count: number): BillingFrequency | null {
  if (interval === 'week' && count === 1) return 'weekly'
  if (interval === 'week' && count === 2) return 'biweekly'
  if (interval === 'month' && count === 1) return 'monthly'
  return null
}

/** Map a Stripe subscription status onto our internal billing status. */
function mapStatus(status: Stripe.Subscription.Status): BillingStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'past_due'
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled'
    case 'paused':
      return 'paused'
    default:
      return 'none'
  }
}

/**
 * Look up an existing Stripe subscription by id and normalize it for import as a
 * tenant's rent billing. Read-only. Returns a clean error for a bad id, a missing
 * recurring price, or an interval we don't support (e.g. yearly).
 */
export async function fetchSubscriptionForImport(subscriptionId: string): Promise<SubscriptionImportResult> {
  const id = subscriptionId.trim()
  if (!id.startsWith('sub_')) return { ok: false, error: 'Enter a Stripe subscription id (it starts with “sub_”).' }

  let sub: Stripe.Subscription
  try {
    sub = await getStripe().subscriptions.retrieve(id, { expand: ['customer', 'items.data.price'] })
  } catch (err) {
    logError('stripe/import-subscription-lookup', err)
    return { ok: false, error: 'No Stripe subscription found for that id.' }
  }

  const item = sub.items.data[0]
  const price = item?.price
  if (!price?.recurring || price.unit_amount == null) {
    return { ok: false, error: 'That subscription has no recurring price to import.' }
  }

  const frequency = mapInterval(price.recurring.interval, price.recurring.interval_count)
  if (!frequency) {
    return { ok: false, error: 'Unsupported billing interval — only weekly, every 2 weeks, or monthly can be imported.' }
  }

  const customer = sub.customer
  const customerId = typeof customer === 'string' ? customer : customer.id
  let customerEmail: string | null = null
  let customerName: string | null = null
  if (typeof customer !== 'string' && !('deleted' in customer && customer.deleted)) {
    customerEmail = (customer as Stripe.Customer).email ?? null
    customerName = (customer as Stripe.Customer).name ?? null
  }

  return {
    ok: true,
    data: {
      customerId,
      customerEmail,
      customerName,
      amountCents: price.unit_amount * (item.quantity ?? 1),
      frequency,
      status: mapStatus(sub.status),
      nextDraftAt: new Date(item.current_period_end * 1000),
    },
  }
}

// ---- Rent subscription changes & credits (admin) ---------------------------
// Stripe behaviour relied on here is noted in docs/vendor/stripe-rent-billing.md.

/** Stripe recurring interval for each rent frequency. Shared by rent setup and rent changes. */
export const RENT_INTERVALS: Record<BillingFrequency, { interval: 'week' | 'month'; interval_count: number }> = {
  weekly: { interval: 'week', interval_count: 1 },
  biweekly: { interval: 'week', interval_count: 2 },
  monthly: { interval: 'month', interval_count: 1 },
}

export type RentSubscriptionState = {
  status: Stripe.Subscription.Status
  paused: boolean
  /** Charge per draft (fee included), from the live price. */
  amountCents: number
  frequency: BillingFrequency | null
  /** When Stripe will next draft (end of trial or current period). */
  nextDraftAt: Date
}

/** Live view of a rent subscription, for the admin page. Null if Stripe can't be reached / no such sub. */
export async function getRentSubscriptionState(subscriptionId: string): Promise<RentSubscriptionState | null> {
  try {
    const sub = await getStripe().subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] })
    const item = sub.items.data[0]
    const price = item?.price
    if (!item || !price?.recurring || price.unit_amount == null) return null
    // During a "trial" (our way of scheduling the next draft) the period end IS the trial end.
    const nextEpoch = sub.status === 'trialing' && sub.trial_end ? sub.trial_end : item.current_period_end
    return {
      status: sub.status,
      paused: Boolean(sub.pause_collection),
      amountCents: price.unit_amount * (item.quantity ?? 1),
      frequency: mapInterval(price.recurring.interval, price.recurring.interval_count),
      nextDraftAt: new Date(nextEpoch * 1000),
    }
  } catch (err) {
    logError('stripe/rent-state', err, { subscriptionId })
    return null
  }
}

/**
 * Change a rent subscription's amount, frequency and next draft date.
 *
 * How (see docs/vendor/stripe-rent-billing.md):
 *  - Prices are immutable in Stripe, so we create a NEW recurring price on the
 *    same product and swap the subscription's single item onto it.
 *  - `proration_behavior: 'none'` → no partial charges/credits for the current period.
 *  - `trial_end: <next draft>` → nothing is charged until that date, and the
 *    billing cycle re-anchors there. It's the supported way to move the next
 *    charge date of an existing subscription (billing_cycle_anchor can't be set
 *    to an arbitrary date on update). The sub shows as 'trialing' until then,
 *    which our webhook maps to 'active'.
 *  - `idempotencyKey` (from the form) makes a double-submit a no-op.
 * Pause state (pause_collection) is left untouched.
 */
export async function adjustRentSubscription(input: {
  subscriptionId: string
  amountCents: number
  frequency: BillingFrequency
  nextDraftAt: Date
  tenantId: string
  idempotencyKey: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const stripe = getStripe()
  let sub: Stripe.Subscription
  try {
    sub = await stripe.subscriptions.retrieve(input.subscriptionId, { expand: ['items.data.price'] })
  } catch (err) {
    logError('stripe/rent-adjust-retrieve', err, { tenantId: input.tenantId })
    return { ok: false, error: 'Could not load the subscription from Stripe.' }
  }
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
    return { ok: false, error: 'This subscription is canceled in Stripe — set up rent again instead.' }
  }
  if (sub.items.data.length !== 1) {
    return { ok: false, error: 'This subscription has several items — change it in the Stripe dashboard.' }
  }
  const item = sub.items.data[0]
  const product = item.price.product
  const productId = typeof product === 'string' ? product : product.id

  try {
    const price = await stripe.prices.create(
      {
        currency: 'usd',
        unit_amount: input.amountCents,
        recurring: RENT_INTERVALS[input.frequency],
        product: productId,
        metadata: { tenantId: input.tenantId },
      },
      { idempotencyKey: `${input.idempotencyKey}:price` },
    )
    await stripe.subscriptions.update(
      input.subscriptionId,
      {
        items: [{ id: item.id, price: price.id, quantity: 1 }],
        proration_behavior: 'none',
        trial_end: Math.floor(input.nextDraftAt.getTime() / 1000),
        metadata: { tenantId: input.tenantId },
      },
      { idempotencyKey: `${input.idempotencyKey}:sub` },
    )
    return { ok: true }
  } catch (err) {
    logError('stripe/rent-adjust-update', err, { tenantId: input.tenantId })
    return { ok: false, error: 'Stripe rejected the change. Check the date (must be within 2 years) and try again.' }
  }
}

/**
 * Credit a customer's Stripe balance. A NEGATIVE balance transaction is a
 * credit: Stripe applies it automatically to the next invoice(s), reducing what
 * is drafted; any remainder carries over to later invoices.
 */
export async function addCustomerCredit(input: {
  customerId: string
  amountCents: number
  description: string
  metadata: Record<string, string>
  idempotencyKey: string
}): Promise<{ ok: true; transactionId: string } | { ok: false; error: string }> {
  try {
    const txn = await getStripe().customers.createBalanceTransaction(
      input.customerId,
      { amount: -input.amountCents, currency: 'usd', description: input.description, metadata: input.metadata },
      { idempotencyKey: input.idempotencyKey },
    )
    return { ok: true, transactionId: txn.id }
  } catch (err) {
    logError('stripe/add-credit', err, input.metadata)
    return { ok: false, error: 'Stripe could not add the credit. Please try again.' }
  }
}

/** Unused credit on the customer (cents, ≥0). Stripe stores credit as a negative balance. Null on error. */
export async function getCustomerCreditCents(customerId: string): Promise<number | null> {
  try {
    const customer = await getStripe().customers.retrieve(customerId)
    if ('deleted' in customer && customer.deleted) return null
    return Math.max(0, -(customer as Stripe.Customer).balance)
  } catch (err) {
    logError('stripe/customer-balance', err)
    return null
  }
}
