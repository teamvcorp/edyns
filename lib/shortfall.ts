import 'server-only'

import type { Tenant } from './tenants'
import { balancesFor, sumBetween } from './program-ledger'
import { isUpgradeReady } from './programs'

/**
 * Own-landlord rent shortfall math, shared by the monthly cron
 * (app/api/cron/rent-shortfall) and the tenant "pay the difference" action.
 *
 *   owed this month = landlord rent − already paid to the landlord this month
 *   shortfall       = owed this month − rent on hand (collected, not yet paid out)
 *
 * Any surplus (on hand > owed) stays with edynsgate as the tenant's AVAILABLE
 * RENT FUNDS (business rule): never refunded, it covers future rent (shortfalls,
 * a job change) and builds toward a nicer-home upgrade (UPGRADE_RESERVE_MONTHS).
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

/**
 * Available rent funds for an outside-landlord tenant: everything collected and
 * not yet paid out, the part still owed for this month, the RESERVE beyond it,
 * and whether that reserve makes them upgrade-ready for a nicer home.
 */
export async function rentFunds(
  tenant: Tenant,
  now: Date = new Date(),
): Promise<{ availableCents: number; owedThisMonthCents: number; reserveCents: number; upgradeReady: boolean } | null> {
  const s = await computeShortfall(tenant, now)
  if (!s) return null
  const reserveCents = Math.max(0, s.onHandCents - s.owedCents)
  return {
    availableCents: s.onHandCents,
    owedThisMonthCents: s.owedCents,
    reserveCents,
    upgradeReady: isUpgradeReady(reserveCents, s.rentCents),
  }
}
