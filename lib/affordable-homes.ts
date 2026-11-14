import 'server-only'

import { listApprovedProperties, type Property } from './properties'
import { listOccupiedPropertyIds } from './tenants'
import { affordableRentFor } from './programs'

/**
 * "Homes within your budget": approved, unoccupied homes in our network whose
 * admin-set monthly rent is at most 30% of the given monthly income
 * (AFFORDABLE_RENT_RATE in lib/programs.ts). Cheapest first.
 *
 * Used on the tenant dashboard (#affordable), and linked from the enrollment
 * over-budget warning and the monthly shortfall email — the business goal is
 * to move people into housing they can afford.
 */
export async function affordablePropertiesFor(
  monthlyIncome: number,
  limit = 6,
): Promise<{ maxRent: number; homes: Property[] }> {
  const maxRent = affordableRentFor(monthlyIncome)
  if (!(monthlyIncome > 0)) return { maxRent: 0, homes: [] }
  const [approved, occupied] = await Promise.all([listApprovedProperties(), listOccupiedPropertyIds()])
  const homes = approved
    .filter((p) => p.monthlyRent != null && p.monthlyRent > 0 && p.monthlyRent <= maxRent && !occupied.has(p.id))
    .sort((a, b) => (a.monthlyRent ?? 0) - (b.monthlyRent ?? 0))
    .slice(0, limit)
  return { maxRent, homes }
}
