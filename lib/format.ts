export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null) return '—'
  return new Intl.NumberFormat('en-US').format(value)
}

export function formatAddress(a?: {
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
}): string {
  if (!a) return '—'
  return [a.line1, a.line2, `${a.city}, ${a.state} ${a.postalCode}`, a.country].filter(Boolean).join(', ')
}
