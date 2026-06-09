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
