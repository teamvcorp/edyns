import Stripe from 'stripe'
import { getStripe, invoiceSubscriptionId, invoiceRentSplit } from '@/lib/stripe'
import {
  applyFeeResult,
  setBillingStatusBySubscription,
  syncPauseFromStripe,
  getTenantBySubscriptionId,
  markShortfallPaid,
  type BillingStatus,
  type Tenant,
} from '@/lib/tenants'
import { PROGRAMS, programOf } from '@/lib/programs'
import { recordLedgerEntry } from '@/lib/program-ledger'
import { recordTenantPayment } from '@/lib/tenant-payments'
import {
  markCollectionProcessing,
  markCollectionSucceeded,
  markCollectionFailed,
  handleCollectionDispute,
} from '@/lib/paychecks'
import { recordInvoicePayment, type PaymentPhase } from '@/lib/invoices'
import { markPayoutPaid, createPaidPayout, markPayoutReversedByTransfer } from '@/lib/payouts'
import { findPartnerByStripeAccountId } from '@/lib/users'
import { logError, logWarn } from '@/lib/log'

/**
 * A rent invoice that should create money records: actually paid, non-zero.
 * Credit-covered invoices count (amount_paid 0 but total > 0) — a credit stands
 * in for money paid another way (policy decided 2026-11-01). Zero-total invoices
 * — e.g. the $0 invoice Stripe issues when a "trial" (our next-draft-date
 * scheduling) starts — are skipped.
 */
function isPaidRentInvoice(invoice: Stripe.Invoice): invoice is Stripe.Invoice & { id: string } {
  return Boolean(invoice.id) && invoice.status === 'paid' && !!invoice.total && invoice.total > 0
}

function invoicePaidAt(invoice: Stripe.Invoice): Date {
  return new Date((invoice.status_transitions?.paid_at ?? invoice.created) * 1000)
}

/**
 * Base rent/car amounts a paid subscription invoice represents.
 * - Effort Exchange: the whole base is rent (equity accrues on it). The Stripe
 *   processing gross-up the tenant covers stays with the platform; fall back to
 *   the invoice total if no base is recorded (shouldn't happen).
 * - Other programs: the split stamped on the invoice's Stripe PRICE (terms live
 *   when it was billed), else the tenant's current split, else the program's
 *   only bucket.
 */
async function invoiceAmounts(
  invoice: Stripe.Invoice & { id: string },
  tenant: Tenant,
): Promise<{ rentCents: number; carCents: number }> {
  const program = programOf(tenant)
  if (PROGRAMS[program].managedHousing) {
    return { rentCents: tenant.billing?.baseAmountCents ?? invoice.total, carCents: 0 }
  }
  let split = await invoiceRentSplit(invoice)
  if (!split && tenant.billing?.split) split = { ...tenant.billing.split }
  if (!split) {
    const base = tenant.billing?.baseAmountCents ?? invoice.total
    logWarn('stripe/webhook/program-split', 'invoice had no split metadata; using program default', {
      tenantId: tenant.id,
      invoiceId: invoice.id,
    })
    split = PROGRAMS[program].rentRate > 0 ? { rentCents: base, carCents: 0 } : { rentCents: 0, carCents: base }
  }
  return { rentCents: split.rentCents, carCents: split.carCents }
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
    logWarn('stripe/webhook', 'invalid Stripe signature')
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
    } else if (session.metadata?.type === 'rent_shortfall') {
      // Own-landlord tenant paid this month's rent difference (app/actions/tenants.ts
      // payShortfallAction). Metadata was written by our server and the event is
      // signature-verified, so it's trusted. ACH settles later: act only once paid.
      if (paid && !failed) {
        const { tenantId, month } = session.metadata
        const baseCents = Number(session.metadata.baseCents)
        if (tenantId && month && Number.isInteger(baseCents) && baseCents > 0) {
          try {
            await recordLedgerEntry({
              tenantId,
              bucket: 'rent',
              kind: 'shortfall_payment',
              amountCents: baseCents, // base only — the processing gross-up isn't rent
              ref: `shortfall:${session.id}`,
              at: new Date(),
              source: 'tenant',
              note: `Rent balance for ${month}`,
            })
            await markShortfallPaid(tenantId, month, new Date())
          } catch (err) {
            logError('stripe/webhook/shortfall', err, { tenantId })
            return new Response('Ledger write failed', { status: 500 }) // Stripe retries; idempotent on ref
          }
        } else {
          logWarn('stripe/webhook/shortfall', 'rent_shortfall session with bad metadata', { sessionId: session.id })
        }
      }
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
    // Pause state comes from Stripe: covers admin pauses, dashboard pauses, and
    // automatic resume on the pause's resumes_at date.
    const pc = sub.pause_collection
    if (pc) {
      await syncPauseFromStripe(sub.id, { resumesAt: pc.resumes_at ? new Date(pc.resumes_at * 1000) : undefined }, status ?? 'active')
    } else if (status) {
      await syncPauseFromStripe(sub.id, null, status)
    }
    if (status) await setBillingStatusBySubscription(sub.id, status) // no-op while paused
  } else if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    await setBillingStatusBySubscription(sub.id, 'canceled')
  } else if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice
    const subId = invoiceSubscriptionId(invoice)
    if (subId) {
      await setBillingStatusBySubscription(subId, 'active')
      const tenant = isPaidRentInvoice(invoice) ? await getTenantBySubscriptionId(subId) : null
      if (tenant && isPaidRentInvoice(invoice)) {
        const managed = PROGRAMS[programOf(tenant)].managedHousing
        try {
          await recordTenantPayment({
            tenant,
            ref: `inv:${invoice.id}`,
            ...(await invoiceAmounts(invoice, tenant)),
            paidAt: invoicePaidAt(invoice),
          })
        } catch (err) {
          logError(managed ? 'stripe/webhook/rent-equity' : 'stripe/webhook/program-ledger', err, {
            invoiceId: invoice.id,
            tenantId: tenant.id,
          })
          // Partner equity is best-effort; the program ledger is a money record →
          // 500 so Stripe retries (writes are idempotent).
          if (!managed) return new Response('Ledger write failed', { status: 500 })
        }
      }
    }
  } else if (
    event.type === 'payment_intent.processing' ||
    event.type === 'payment_intent.succeeded' ||
    event.type === 'payment_intent.payment_failed'
  ) {
    // Per-paycheck collections (lib/paychecks.ts). Other PaymentIntents (Checkout
    // fees, invoices) are handled by their own events above and ignored here.
    const pi = event.data.object as Stripe.PaymentIntent
    if (pi.metadata?.type === 'paycheck_collection') {
      try {
        if (event.type === 'payment_intent.processing') await markCollectionProcessing(pi)
        else if (event.type === 'payment_intent.succeeded') await markCollectionSucceeded(pi)
        else await markCollectionFailed(pi)
      } catch (err) {
        logError('stripe/webhook/paycheck', err, { paymentIntentId: pi.id })
        return new Response('Paycheck update failed', { status: 500 }) // idempotent; Stripe retries
      }
    }
  } else if (event.type === 'charge.dispute.created') {
    // A disputed bank debit invalidates the ACH mandate: stop paycheck collection.
    const dispute = event.data.object as Stripe.Dispute
    try {
      await handleCollectionDispute(dispute)
    } catch (err) {
      logError('stripe/webhook/dispute', err, { disputeId: dispute.id })
      return new Response('Dispute handling failed', { status: 500 })
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
    } catch (err) {
      logError('stripe/webhook/transfer-created', err, { transferId: transfer.id })
      /* accounting is best-effort — never fail the webhook over it */
    }
  } else if (event.type === 'transfer.reversed') {
    // Full reversal: flip the debit so the partner's available balance restores.
    try {
      await markPayoutReversedByTransfer((event.data.object as Stripe.Transfer).id)
    } catch (err) {
      logError('stripe/webhook/transfer-reversed', err)
      /* best-effort */
    }
  }

  return new Response('ok', { status: 200 })
}
