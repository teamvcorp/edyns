import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { applyFeeResult, setBillingStatusBySubscription, type BillingStatus } from '@/lib/tenants'

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
    const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id

    await applyFeeResult(session.id, {
      status: failed ? 'unpaid' : paid ? 'paid' : 'processing',
      paymentIntentId: pi ?? undefined,
    })
  } else if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription
    const status = mapSubscriptionStatus(sub.status)
    if (status) await setBillingStatusBySubscription(sub.id, status)
  } else if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    await setBillingStatusBySubscription(sub.id, 'canceled')
  } else if (event.type === 'invoice.paid') {
    const subId = invoiceSubscriptionId(event.data.object as Stripe.Invoice)
    if (subId) await setBillingStatusBySubscription(subId, 'active')
  } else if (event.type === 'invoice.payment_failed') {
    const subId = invoiceSubscriptionId(event.data.object as Stripe.Invoice)
    if (subId) await setBillingStatusBySubscription(subId, 'past_due')
  }

  return new Response('ok', { status: 200 })
}
