import Stripe from 'stripe'
import { getStripe, invoiceSubscriptionId } from '@/lib/stripe'
import {
  applyFeeResult,
  setBillingStatusBySubscription,
  getTenantBySubscriptionId,
  type BillingStatus,
} from '@/lib/tenants'
import { getPropertyById } from '@/lib/properties'
import { recordRentEquity } from '@/lib/equity'
import { recordInvoicePayment, type PaymentPhase } from '@/lib/invoices'
import { markPayoutPaid, createPaidPayout, markPayoutReversedByTransfer } from '@/lib/payouts'
import { findPartnerByStripeAccountId } from '@/lib/users'

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
  } else if (event.type === 'transfer.created') {
    // Auto-log every transfer to a partner's connected account as a debit
    // against their equity balance — including transfers made directly in the
    // Stripe Dashboard, and as a safety net when an in-app transfer succeeded
    // but the action's own record write failed. Best-effort: accounting never
    // fails the webhook response.
    const transfer = event.data.object as Stripe.Transfer
    try {
      const payoutId = transfer.metadata?.payoutId
      if (payoutId) {
        // In-app approved request: settle the existing row (idempotent — the
        // admin action's own markPayoutPaid makes the later call a no-op).
        await markPayoutPaid(payoutId, transfer.id)
      } else {
        // Forced or external transfer: resolve the partner from metadata,
        // falling back to the destination account. Insert is idempotent on the
        // transfer id, so a row the admin action already wrote isn't duplicated.
        const destination = typeof transfer.destination === 'string' ? transfer.destination : transfer.destination?.id
        const partnerId =
          transfer.metadata?.partnerId ??
          (destination ? (await findPartnerByStripeAccountId(destination))?.id : undefined)
        if (partnerId) {
          await createPaidPayout(partnerId, transfer.amount, transfer.id, 'external', {
            paidAt: new Date(transfer.created * 1000),
            note: 'Recorded automatically from a Stripe transfer',
          })
        }
        // No partner match → not a partner payout; nothing to record.
      }
    } catch {
      /* accounting is best-effort — never fail the webhook over it */
    }
  } else if (event.type === 'transfer.reversed') {
    // Full reversal: flip the debit so the partner's available balance restores.
    try {
      await markPayoutReversedByTransfer((event.data.object as Stripe.Transfer).id)
    } catch {
      /* best-effort */
    }
  }

  return new Response('ok', { status: 200 })
}
