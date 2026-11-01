/**
 * Processing-fee math, safe to import from BOTH server and client components
 * (no 'server-only', no Stripe SDK). Keeping one copy means the admin form's
 * live preview always matches what the server actually charges.
 * lib/stripe.ts re-exports these for existing server imports.
 */

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
