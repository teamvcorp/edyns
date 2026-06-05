import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listTenants } from '@/lib/tenants'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { Link } from '@/components/elements/link'
import { ButtonLink } from '@/components/elements/button'

export const metadata: Metadata = { title: 'Tenant applications' }

const feeLabel = { unpaid: 'Fee unpaid', processing: 'Fee processing', paid: 'Fee paid' } as const
const statusLabel = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' } as const

export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; email?: string }>
}) {
  await requireRole('admin', '/admin/login')
  const sp = await searchParams
  const tenants = await listTenants()
  const pending = tenants.filter((t) => t.status === 'pending')
  const decided = tenants.filter((t) => t.status !== 'pending')

  const Row = ({ t }: { t: (typeof tenants)[number] }) => (
    <Card className="flex flex-wrap items-center justify-between gap-4 py-5">
      <div className="flex flex-col">
        <span className="font-medium text-olive-950 dark:text-white">{t.name}</span>
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
    <PortalShell eyebrow="Administration" title={`Tenant applications (${tenants.length})`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {sp.created ? (
          <p role="status" className="text-sm text-olive-700 dark:text-olive-300">
            Tenant created.{sp.email === 'failed' ? ' (Credentials email failed to send — share the password manually.)' : ' Credentials emailed.'}
          </p>
        ) : (
          <span />
        )}
        <ButtonLink href="/admin/tenants/new">Add tenant</ButtonLink>
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

      {decided.length > 0 && (
        <div className="flex flex-col gap-6">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Decided ({decided.length})</h3>
          <div className="flex flex-col gap-3">{decided.map((t) => <Row key={t.id} t={t} />)}</div>
        </div>
      )}
    </PortalShell>
  )
}
