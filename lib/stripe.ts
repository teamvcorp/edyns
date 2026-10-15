import 'server-only'

import Stripe from 'stripe'
import type { BillingFrequency, BillingStatus } from './tenants'

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

/** Stripe card processing rate (worst case across bank/card) — the payer covers this. */
export const STRIPE_PERCENT = 0.029
export const STRIPE_FIXED_CENTS = 30

/**
 * Gross up a base amount so the payer (not edynsgate) covers Stripe's processing
 * fee. Uses the card rate as the worst case so fees are always covered regardless
 * of whether they pay by bank or card, leaving edynsgate the full base amount.
 */
export function withProcessingFee(baseCents: number): number {
  return Math.ceil((baseCents + STRIPE_FIXED_CENTS) / (1 - STRIPE_PERCENT))
}

/** Just the processing-fee portion of a grossed-up charge, in cents. */
export function processingFeeCents(baseCents: number): number {
  return withProcessingFee(baseCents) - baseCents
}

/** Total the tenant is charged for the application fee, fee included. */
export function applicationTotalCents(): number {
  return withProcessingFee(APPLICATION_FEE_CENTS)
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
  } catch {
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
    } catch {
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
  } catch {
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
