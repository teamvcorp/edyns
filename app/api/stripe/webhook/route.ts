import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import {
  applyFeeResult,
  setBillingStatusBySubscription,
  getTenantBySubscriptionId,
  type BillingStatus,
} from '@/lib/tenants'
import { getPropertyById } from '@/lib/properties'
import { recordRentEquity } from '@/lib/equity'
import { recordInvoicePayment, type PaymentPhase } from '@/lib/invoices'

/** Default partner equity share when a property hasn't set one. */
const DEFAULT_EQUITY_SHARE_PERCENT = 10

/**
 * Credit the partner's rent-equity ledger for a paid rent invoice: an admin-set
 * percentage of the base rent (per property) becomes partner equity. Best-effort
 * and idempotent (keyed on the invoice id) — never blocks the webhook response.
 */
async function recordRentEquityForInvoice(invoice: Stripe.Invoice, subscriptionId: string): Promise<void> {
  // Only credit when money actually moved.
  if (!invoice.id || !invoice.amount_paid || invoice.amount_paid <= 0) return

  const tenant = await getTenantBySubscriptionId(subscriptionId)
  if (!tenant?.currentPropertyId) return

  const property = await getPropertyById(tenant.currentPropertyId)
  if (!property) return

  // Equity accrues on the base rent the platform keeps — the Stripe processing-fee
  // gross-up that the tenant covers stays with the platform. Fall back to the amount
  // paid if no base is recorded (shouldn't happen for a subscription invoice).
  const rentCents = tenant.billing?.baseAmountCents ?? invoice.amount_paid

  const sharePercent = property.equitySharePercent ?? DEFAULT_EQUITY_SHARE_PERCENT
  if (sharePercent <= 0) return
  const equityCents = Math.round((rentCents * sharePercent) / 100)
  if (equityCents <= 0) return

  const paidAtEpoch = invoice.status_transitions?.paid_at ?? invoice.created
  await recordRentEquity({
    partnerId: property.partnerId,
    propertyId: property.id,
    tenantId: tenant.id,
    stripeInvoiceId: invoice.id,
    rentCents,
    sharePercent,
    equityCents,
    paidAt: new Date(paidAtEpoch * 1000),
  })
}

/** Map a Stripe subscription status to our billing status. */
function mapSubscriptionStatus(s: Stripe.Subscription.Status): BillingStatus | null {
  if (s === 'active' || s === 'trialing') return 'active'
  if (s === 'past_due' || s === 'unpaid') return 'past_due'
  if (s === 'canceled' || s === 'incomplete_expired') return 'canceled'
  return null
}

/** Extract the subscription id from an invoice across Stripe API shapes. */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const i = invoice as unknown as {
    subscription?: string | { id?: string }
    parent?: { subscription_details?: { subscription?: string } }
  }
  if (typeof i.subscription === 'string') return i.subscription
  if (i.subscription?.id) return i.subscription.id
  return i.parent?.subscription_details?.subscription
}

/**
 * Stripe webhook — finalizes the application fee out-of-band (bank/ACH settles
 * after Checkout) and keeps recurring rent billing status in sync.
 * Verifies the signature against STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return new Response('Webhook not configured', { status: 500 })

  const signature = request.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  const payload = await request.text()
  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded' ||
    event.type === 'checkout.session.async_payment_failed'
  ) {
    const session = event.data.object as Stripe.Checkout.Session
    const paid = session.payment_status === 'paid'
    const failed = event.type === 'checkout.session.async_payment_failed'

    // Sessions carry a `type` in metadata so we can route them. Project-invoice
    // payments update the invoice; everything else is a tenant application fee.
    if (session.metadata?.type === 'project_invoice') {
      const invoiceId = session.metadata.invoiceId
      const phase = session.metadata.phase as PaymentPhase | undefined
      if (invoiceId && phase) await recordInvoicePayment(invoiceId, session.id, phase, paid && !failed)
    } else {
      const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
      await applyFeeResult(session.id, {
        status: failed ? 'unpaid' : paid ? 'paid' : 'processing',
        paymentIntentId: pi ?? undefined,
      })
    }
  } else if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription
    const status = mapSubscriptionStatus(sub.status)
    if (status) await setBillingStatusBySubscription(sub.id, status)
  } else if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    await setBillingStatusBySubscription(sub.id, 'canceled')
  } else if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice
    const subId = invoiceSubscriptionId(invoice)
    if (subId) {
      await setBillingStatusBySubscription(subId, 'active')
      try {
        await recordRentEquityForInvoice(invoice, subId)
      } catch {
        /* equity crediting is best-effort — never fail the webhook over it */
      }
    }
  } else if (event.type === 'invoice.payment_failed') {
    const subId = invoiceSubscriptionId(event.data.object as Stripe.Invoice)
    if (subId) await setBillingStatusBySubscription(subId, 'past_due')
  }

  return new Response('ok', { status: 200 })
}
