import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { applyFeeResult } from '@/lib/tenants'

/**
 * Stripe webhook — finalizes the application fee out-of-band, which matters for
 * bank/ACH payments that settle after the user has already left Checkout.
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
  }

  return new Response('ok', { status: 200 })
}
