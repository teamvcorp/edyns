/** Housing tiers — tenants start at tier 0 and move up as their income grows. */
export const TIERS = [
  { value: 0, label: 'Apartment' },
  { value: 1, label: 'Larger apartment' },
  { value: 2, label: 'Duplex' },
  { value: 3, label: 'Stand-alone house' },
  { value: 4, label: 'Medium house' },
  { value: 5, label: 'Large house' },
] as const

export const MIN_TIER = 0
export const MAX_TIER = 5

export function tierLabel(tier: number | undefined | null): string {
  if (tier === undefined || tier === null) return '—'
  return TIERS.find((t) => t.value === tier)?.label ?? `Tier ${tier}`
}
