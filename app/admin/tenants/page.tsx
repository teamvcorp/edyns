import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listTenants } from '@/lib/tenants'
import { getPropertyById } from '@/lib/properties'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { Link } from '@/components/elements/link'
import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { formatAddress, formatCurrency } from '@/lib/format'

export const metadata: Metadata = { title: 'Tenant applications' }

const feeLabel = { unpaid: 'Fee unpaid', processing: 'Fee processing', paid: 'Fee paid' } as const
const statusLabel = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' } as const
const frequencyLabel = { weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly' } as const

export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; email?: string }>
}) {
  await requireRole('admin', '/admin/login')
  const sp = await searchParams
  const tenants = await listTenants()
  const pending = tenants.filter((t) => t.status === 'pending')
  const stripePending = tenants.filter((t) => t.billing?.imported)
  const decided = tenants.filter((t) => t.status !== 'pending' && !t.billing?.imported)

  // Resolve the linked property for each imported tenant (small list).
  const stripeRows = await Promise.all(
    stripePending.map(async (t) => ({
      t,
      property: t.currentPropertyId ? await getPropertyById(t.currentPropertyId) : null,
    })),
  )

  const Row = ({ t }: { t: (typeof tenants)[number] }) => (
    <Card className="flex flex-wrap items-center justify-between gap-4 py-5">
      <div className="flex flex-col">
        <span className="font-medium text-olive-950 dark:text-white">
          {t.name}
          {t.flaggedForReview && (
            <span className="ml-2 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-400">
              ⚠️ Review
            </span>
          )}
        </span>
        <span className="text-sm text-olive-600 dark:text-olive-500">
          {t.email} · household of {1 + t.adults.length + t.children.length}
        </span>
      </div>
      <div className="flex items-center gap-6">
        <span className="text-sm text-olive-600 dark:text-olive-500">{feeLabel[t.fee.status]}</span>
        <span className="text-sm font-semibold text-olive-700 dark:text-olive-300">{statusLabel[t.status]}</span>
        <Link href={`/admin/tenants/${t.id}`}>Review</Link>
      </div>
    </Card>
  )

  return (
    <PortalShell
      eyebrow="Administration"
      title={`Tenant applications (${tenants.length})`}
      breadcrumbs={[{ label: 'Admin dashboard', href: '/admin' }, { label: 'Tenant applications' }]}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {sp.created ? (
          <p role="status" className="text-sm text-olive-700 dark:text-olive-300">
            Tenant created.{sp.email === 'failed' ? ' (Credentials email failed to send — share the password manually.)' : ' Credentials emailed.'}
          </p>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <PlainButtonLink href="/admin/tenants/import">Import from Stripe</PlainButtonLink>
          <ButtonLink href="/admin/tenants/new">Add tenant</ButtonLink>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Pending ({pending.length})</h3>
        {pending.length === 0 ? (
          <Card>
            <Text className="text-sm/6">
              <p>No applications awaiting review.</p>
            </Text>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">{pending.map((t) => <Row key={t.id} t={t} />)}</div>
        )}
      </div>

      {stripeRows.length > 0 && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">
              Stripe pending ({stripeRows.length})
            </h3>
            <Text className="text-sm/6">
              <p>Subscriptions imported from Stripe — active and paying. Confirm each is linked to the right property.</p>
            </Text>
          </div>
          <div className="flex flex-col gap-3">
            {stripeRows.map(({ t, property }) => (
              <Card key={t.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div className="flex flex-col">
                  <span className="font-medium text-olive-950 dark:text-white">{t.name}</span>
                  <span className="text-sm text-olive-600 dark:text-olive-500">
                    {t.email} · {property ? formatAddress(property.address) : 'No property linked'}
                  </span>
                </div>
                <div className="flex items-center gap-6">
                  {t.billing && (
                    <span className="text-sm text-olive-600 dark:text-olive-500">
                      {formatCurrency(t.billing.amountCents / 100)} {frequencyLabel[t.billing.frequency]}
                    </span>
                  )}
                  <Link href={`/admin/tenants/${t.id}`}>Review</Link>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {decided.length > 0 && (
        <div className="flex flex-col gap-6">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Decided ({decided.length})</h3>
          <div className="flex flex-col gap-3">{decided.map((t) => <Row key={t.id} t={t} />)}</div>
        </div>
      )}
    </PortalShell>
  )
}
