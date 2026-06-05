import 'server-only'

import Stripe from 'stripe'

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

/**
 * Total the tenant is charged, grossed up so they cover Stripe's processing fee.
 * Uses the card rate (2.9% + 30¢) as the worst case so fees are always covered
 * regardless of whether they pay by bank or card.
 */
export function applicationTotalCents(): number {
  return Math.ceil((APPLICATION_FEE_CENTS + 30) / (1 - 0.029))
}
