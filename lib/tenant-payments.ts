import 'server-only'

import type { Tenant } from './tenants'
import { PROGRAMS, programOf } from './programs'
import { getPropertyById } from './properties'
import { recordRentEquity } from './equity'
import { recordPaymentDeposits } from './program-ledger'

/**
 * Book ONE successful tenant payment, whatever collected it — a paid
 * subscription invoice (app/api/stripe/webhook) or a per-paycheck debit
 * (lib/paychecks.ts). One code path so both collection modes keep identical
 * money rules:
 *   - Effort Exchange (managed housing) → partner equity on the base rent
 *     (property share %, default 10). Best-effort: the caller decides whether a
 *     failure should fail the webhook.
 *   - Every other program → program ledger: rent held for the landlord + car
 *     program payments (lib/program-ledger.ts).
 * Idempotent: equity is unique per `ref`; ledger refs are `<ref>:rent|car`.
 */

/** Default partner equity share when a property hasn't set one (CODEMAP D16). */
export const DEFAULT_EQUITY_SHARE_PERCENT = 10

export async function recordTenantPayment(input: {
  tenant: Tenant
  /** Stable payment id with a type prefix: `inv:<invoiceId>` or `pi:<paymentIntentId>`. */
  ref: string
  /** Base amounts (before the processing fee the tenant covers). */
  rentCents: number
  carCents: number
  paidAt: Date
}): Promise<void> {
  const { tenant } = input
  if (PROGRAMS[programOf(tenant)].managedHousing) {
    if (!tenant.currentPropertyId) return
    const property = await getPropertyById(tenant.currentPropertyId)
    if (!property) return
    const sharePercent = property.equitySharePercent ?? DEFAULT_EQUITY_SHARE_PERCENT
    const equityCents = Math.round((input.rentCents * sharePercent) / 100)
    if (sharePercent <= 0 || equityCents <= 0) return
    await recordRentEquity({
      partnerId: property.partnerId,
      propertyId: property.id,
      tenantId: tenant.id,
      // Historical field name; holds any unique payment ref (invoice or PaymentIntent).
      stripeInvoiceId: input.ref.replace(/^inv:/, ''),
      rentCents: input.rentCents,
      sharePercent,
      equityCents,
      paidAt: input.paidAt,
    })
    return
  }
  await recordPaymentDeposits({
    tenantId: tenant.id,
    ref: input.ref,
    rentCents: input.rentCents,
    carCents: input.carCents,
    paidAt: input.paidAt,
  })
}
