import 'server-only'

import type { Tenant } from './tenants'
import { balancesFor, sumBetween } from './program-ledger'

/**
 * Own-landlord rent shortfall math, shared by the monthly cron
 * (app/api/cron/rent-shortfall) and the tenant "pay the difference" action.
 *
 *   owed this month = landlord rent − already paid to the landlord this month
 *   shortfall       = owed this month − rent on hand (collected, not yet paid out)
 *
 * Any surplus (on hand > owed) simply stays in the rent bucket as a buffer for
 * future months (business decision; admins can refund it with an adjustment).
 */

/** 'YYYY-MM' plus the [start, end) bounds of that calendar month (server local time). */
export function monthKey(d: Date): { key: string; start: Date; end: Date; label: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
  return { key, start, end, label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }
}

export async function computeShortfall(
  tenant: Tenant,
  now: Date,
): Promise<{ rentCents: number; onHandCents: number; owedCents: number; shortfallCents: number } | null> {
  if (!tenant.landlord) return null
  const { start, end } = monthKey(now)
  const [{ rentHeldCents }, paidThisMonth] = await Promise.all([
    balancesFor(tenant.id),
    sumBetween(tenant.id, 'rent', ['landlord_payment'], start, end),
  ])
  const rentCents = tenant.landlord.monthlyRentCents
  const owedCents = Math.max(0, rentCents - -paidThisMonth) // landlord payments are stored negative
  return {
    rentCents,
    onHandCents: rentHeldCents,
    owedCents,
    shortfallCents: Math.max(0, owedCents - rentHeldCents),
  }
}
