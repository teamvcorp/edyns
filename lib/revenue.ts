import 'server-only'

import { getStripe, invoiceSubscriptionId } from './stripe'
import { listTenants, type BillingFrequency, type BillingStatus } from './tenants'

/** Months-worth of drafts per billing cycle, for normalizing to monthly income. */
const MONTHLY_FACTOR: Record<BillingFrequency, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
}

export type UpcomingDraft = {
  tenantId: string
  tenantName: string
  amountCents: number
  frequency: BillingFrequency
  status: BillingStatus
  /** Next charge date; null when the subscription is paused. */
  nextDraftAt: Date | null
  /** True when computed from our schedule because Stripe didn't return the subscription. */
  estimated: boolean
}

export type PaymentStatus = 'paid' | 'failed' | 'due'

export type PaymentRow = {
  tenantId: string
  tenantName: string
  amountCents: number
  status: PaymentStatus
  at: Date
  /** Stripe invoice number when assigned (easier to find in the Stripe Dashboard). */
  invoiceNumber: string | null
}

export type RevenueOverview = {
  /** Expected monthly income from active subscriptions, net of the processing gross-up. */
  projectedMonthlyBaseCents: number
  /** Same projection on the amounts actually charged (incl. processing the tenant covers). */
  projectedMonthlyChargedCents: number
  activeCount: number
  pastDueCount: number
  pausedCount: number
  /** Sum actually collected this calendar month (gross, from paid Stripe invoices). */
  collectedThisMonthCents: number
  upcoming: UpcomingDraft[]
  payments: PaymentRow[]
  /** False when Stripe couldn't be reached: upcoming dates are schedule estimates and history is empty. */
  stripeOk: boolean
}

/**
 * Next draft date computed from our own schedule (first draft + cycle length).
 * A fallback only — Stripe is authoritative, since pauses, retries and anchor
 * changes shift real charge dates.
 */
function nextDraftEstimate(firstDraftAt: Date, frequency: BillingFrequency, now: Date): Date {
  const first = new Date(firstDraftAt)
  if (first > now) return first
  if (frequency === 'monthly') {
    const d = new Date(first)
    while (d <= now) d.setMonth(d.getMonth() + 1)
    return d
  }
  const stepMs = (frequency === 'weekly' ? 7 : 14) * 86_400_000
  const steps = Math.floor((now.getTime() - first.getTime()) / stepMs) + 1
  return new Date(first.getTime() + steps * stepMs)
}

/**
 * Assemble the admin revenue view: projected income from active rent
 * subscriptions, each tenant's next draft, and recent payment history.
 * Live data comes from two Stripe list calls (subscriptions + invoices,
 * 100 most recent each); if Stripe is unreachable the view degrades to
 * schedule-based estimates rather than failing.
 */
export async function getRevenueOverview(): Promise<RevenueOverview> {
  const now = new Date()
  const tenants = await listTenants()
  const billed = tenants.filter((t) => t.billing && t.billing.status !== 'canceled' && t.billing.status !== 'none')

  const activeCount = billed.filter((t) => t.billing!.status === 'active').length
  const pastDueCount = billed.filter((t) => t.billing!.status === 'past_due').length
  const pausedCount = billed.filter((t) => t.billing!.status === 'paused').length

  let projectedMonthlyBaseCents = 0
  let projectedMonthlyChargedCents = 0
  for (const t of billed) {
    if (t.billing!.status !== 'active') continue
    const factor = MONTHLY_FACTOR[t.billing!.frequency]
    projectedMonthlyBaseCents += Math.round(t.billing!.baseAmountCents * factor)
    projectedMonthlyChargedCents += Math.round(t.billing!.amountCents * factor)
  }

  const bySubId = new Map(billed.map((t) => [t.billing!.stripeSubscriptionId, t]))

  // Live reads — authoritative next-charge dates and the real payment record.
  const periodEndBySub = new Map<string, Date>()
  const payments: PaymentRow[] = []
  let collectedThisMonthCents = 0
  let stripeOk = true
  try {
    const stripe = getStripe()
    const [subs, invoices] = await Promise.all([
      stripe.subscriptions.list({ status: 'all', limit: 100 }),
      stripe.invoices.list({ limit: 100 }),
    ])

    for (const s of subs.data) {
      if (!bySubId.has(s.id)) continue
      const end = s.items.data[0]?.current_period_end
      if (end) periodEndBySub.set(s.id, new Date(end * 1000))
    }

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    for (const inv of invoices.data) {
      const subId = invoiceSubscriptionId(inv)
      const tenant = subId ? bySubId.get(subId) : undefined
      if (!tenant) continue // not a rent invoice we know about

      if (inv.status === 'paid') {
        const paidAt = new Date((inv.status_transitions?.paid_at ?? inv.created) * 1000)
        if (paidAt >= monthStart) collectedThisMonthCents += inv.amount_paid
        payments.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          amountCents: inv.amount_paid,
          status: 'paid',
          at: paidAt,
          invoiceNumber: inv.number ?? null,
        })
      } else if (inv.status === 'open' || inv.status === 'uncollectible') {
        payments.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          amountCents: inv.amount_due,
          status: inv.status === 'uncollectible' || (inv.attempt_count ?? 0) > 0 ? 'failed' : 'due',
          at: new Date(inv.created * 1000),
          invoiceNumber: inv.number ?? null,
        })
      }
      // draft/void invoices are noise here — skip them.
    }
    payments.sort((a, b) => b.at.getTime() - a.at.getTime())
  } catch {
    stripeOk = false
  }

  const upcoming: UpcomingDraft[] = billed
    .map((t) => {
      const b = t.billing!
      const live = periodEndBySub.get(b.stripeSubscriptionId)
      return {
        tenantId: t.id,
        tenantName: t.name,
        amountCents: b.amountCents,
        frequency: b.frequency,
        status: b.status,
        // A paused subscription has no next draft until the admin resumes it.
        nextDraftAt: b.status === 'paused' ? null : live ?? nextDraftEstimate(b.firstDraftAt, b.frequency, now),
        estimated: b.status !== 'paused' && !live,
      }
    })
    .sort((a, b) => (a.nextDraftAt?.getTime() ?? Infinity) - (b.nextDraftAt?.getTime() ?? Infinity))

  return {
    projectedMonthlyBaseCents,
    projectedMonthlyChargedCents,
    activeCount,
    pastDueCount,
    pausedCount,
    collectedThisMonthCents,
    upcoming,
    payments,
    stripeOk,
  }
}
