import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { getRevenueOverview } from '@/lib/revenue'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { Link } from '@/components/elements/link'
import { formatCurrency } from '@/lib/format'

export const metadata: Metadata = { title: 'Rent & revenue' }

// Always render from live data — this page exists to confirm what Stripe did.
export const dynamic = 'force-dynamic'

const frequencyLabel = { weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly' } as const
const billingStatusLabel = { active: 'Active', past_due: 'Past due', paused: 'Paused', canceled: 'Canceled', none: '—' } as const

const paymentBadge = {
  paid: 'text-green-700 dark:text-green-400',
  failed: 'text-red-600 dark:text-red-400',
  due: 'text-olive-700 dark:text-olive-300',
} as const
const paymentLabel = { paid: 'Paid', failed: 'Failed', due: 'Due' } as const

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-sm text-olive-600 dark:text-olive-500">{label}</dt>
      <dd className="font-display text-3xl text-olive-950 dark:text-white">{value}</dd>
      {hint && <dd className="text-xs text-olive-600 dark:text-olive-500">{hint}</dd>}
    </div>
  )
}

export default async function AdminRevenuePage() {
  await requireRole('admin', '/admin/login')
  const r = await getRevenueOverview()

  return (
    <PortalShell
      eyebrow="Administration"
      title="Rent & revenue"
      breadcrumbs={[{ label: 'Admin dashboard', href: '/admin' }, { label: 'Rent & revenue' }]}
    >
      {!r.stripeOk && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Stripe couldn’t be reached — next-draft dates below are schedule estimates and payment history is
          unavailable. Reload to retry.
        </p>
      )}

      <Card className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-olive-950 dark:text-white">This month</h3>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Projected monthly income"
            value={formatCurrency(r.projectedMonthlyBaseCents / 100)}
            hint={`net of processing · ${formatCurrency(r.projectedMonthlyChargedCents / 100)} charged`}
          />
          <Stat label="Collected this month" value={formatCurrency(r.collectedThisMonthCents / 100)} hint="gross, from paid invoices" />
          <Stat label="Active subscriptions" value={String(r.activeCount)} />
          <Stat
            label="Needs attention"
            value={String(r.pastDueCount + r.pausedCount)}
            hint={`${r.pastDueCount} past due · ${r.pausedCount} paused`}
          />
        </dl>
      </Card>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Upcoming drafts ({r.upcoming.length})</h3>
          <Text className="text-sm/6">
            <p>
              Next charge per rent subscription, from Stripe’s live billing period. Projection assumes every active
              subscription keeps drafting on schedule.
            </p>
          </Text>
        </div>
        {r.upcoming.length === 0 ? (
          <Card>
            <Text className="text-sm/6">
              <p>No rent subscriptions yet — set up rent collection from a tenant’s page once income is verified.</p>
            </Text>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {r.upcoming.map((u) => (
              <Card key={u.tenantId} className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div className="flex flex-col">
                  <span className="font-medium text-olive-950 dark:text-white">{u.tenantName}</span>
                  <span className="text-sm text-olive-600 dark:text-olive-500">
                    {formatCurrency(u.amountCents / 100)} {frequencyLabel[u.frequency]}
                  </span>
                </div>
                <div className="flex items-center gap-6">
                  <span className="text-sm text-olive-600 dark:text-olive-500">
                    {u.nextDraftAt
                      ? `Next draft ${u.nextDraftAt.toLocaleDateString()}${u.estimated ? ' (estimated)' : ''}`
                      : 'No draft while paused'}
                  </span>
                  <span
                    className={
                      u.status === 'active'
                        ? 'text-sm font-semibold text-olive-700 dark:text-olive-300'
                        : 'text-sm font-semibold text-red-600 dark:text-red-400'
                    }
                  >
                    {billingStatusLabel[u.status]}
                  </span>
                  <Link href={`/admin/tenants/${u.tenantId}`}>View tenant</Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Payment history ({r.payments.length})</h3>
          <Text className="text-sm/6">
            <p>
              The 100 most recent rent invoices, live from Stripe — including failed and still-due attempts. Older
              history lives in the Stripe Dashboard.
            </p>
          </Text>
        </div>
        {r.payments.length === 0 ? (
          <Card>
            <Text className="text-sm/6">
              <p>{r.stripeOk ? 'No rent invoices yet.' : 'Unavailable while Stripe is unreachable.'}</p>
            </Text>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {r.payments.map((p, i) => (
              <Card key={`${p.invoiceNumber ?? p.tenantId}-${i}`} className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div className="flex flex-col">
                  <span className="font-medium text-olive-950 dark:text-white">{p.tenantName}</span>
                  <span className="text-sm text-olive-600 dark:text-olive-500">
                    {p.at.toLocaleDateString()}
                    {p.invoiceNumber ? ` · ${p.invoiceNumber}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-6">
                  <span className="text-sm text-olive-950 dark:text-white">{formatCurrency(p.amountCents / 100)}</span>
                  <span className={`text-sm font-semibold ${paymentBadge[p.status]}`}>{paymentLabel[p.status]}</span>
                  <Link href={`/admin/tenants/${p.tenantId}`}>View tenant</Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  )
}
