import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listAllRequests } from '@/lib/moveins'
import { getTenantById } from '@/lib/tenants'
import { getPropertyById } from '@/lib/properties'
import {
  approveMoveInAction,
  declineMoveInAction,
  reverseMoveInAction,
  evictMoveInAction,
} from '@/app/actions/admin'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { Button, SoftButton } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { formatAddress, formatCurrency } from '@/lib/format'
import { tierLabel } from '@/lib/tiers'

export const metadata: Metadata = { title: 'Move-in requests' }

export default async function AdminMoveInsPage() {
  await requireRole('admin', '/admin/login')
  const requests = await listAllRequests()

  const rows = await Promise.all(
    requests.map(async (r) => ({
      request: r,
      tenant: await getTenantById(r.tenantId),
      property: await getPropertyById(r.propertyId),
    })),
  )

  const pending = rows.filter((r) => r.request.status === 'requested')
  const decided = rows.filter((r) => r.request.status !== 'requested')

  return (
    <PortalShell
      eyebrow="Administration"
      title={`Move-in requests (${requests.length})`}
      breadcrumbs={[{ label: 'Admin dashboard', href: '/admin' }, { label: 'Move-in requests' }]}
    >
      <div className="flex flex-col gap-6">
        <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Pending ({pending.length})</h3>
        {pending.length === 0 ? (
          <Card>
            <Text className="text-sm/6">
              <p>No move-in requests awaiting review.</p>
            </Text>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map(({ request, tenant, property }) => (
              <Card key={request.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-olive-950 dark:text-white">{tenant?.name ?? 'Tenant'}</span>
                  <span className="text-sm text-olive-600 dark:text-olive-500">
                    {property ? formatAddress(property.address) : 'Property'} · Tier {property?.tier ?? 0} ·{' '}
                    {tierLabel(property?.tier)}
                  </span>
                  <span className="text-xs text-olive-600 dark:text-olive-500">
                    Income: {formatCurrency(tenant?.employment.monthlyIncome)}/mo · Requires{' '}
                    {formatCurrency(property?.incomeRequirement)}/mo
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {tenant && <Link href={`/admin/tenants/${tenant.id}`}>View tenant</Link>}
                  <form action={approveMoveInAction}>
                    <input type="hidden" name="id" value={request.id} />
                    <Button type="submit">Approve</Button>
                  </form>
                  <form action={declineMoveInAction}>
                    <input type="hidden" name="id" value={request.id} />
                    <SoftButton type="submit" className="text-red-600 dark:text-red-400">
                      Decline
                    </SoftButton>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <div className="flex flex-col gap-6">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Decided ({decided.length})</h3>
          <div className="flex flex-col gap-3">
            {decided.map(({ request, tenant, property }) => (
              <Card key={request.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div className="flex flex-col">
                  <span className="font-medium text-olive-950 dark:text-white">{tenant?.name ?? 'Tenant'}</span>
                  <span className="text-sm text-olive-600 dark:text-olive-500">
                    {property ? formatAddress(property.address) : 'Property'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-olive-700 capitalize dark:text-olive-300">
                    {request.status}
                  </span>
                  {request.status === 'approved' && (
                    <>
                      <form action={reverseMoveInAction}>
                        <input type="hidden" name="id" value={request.id} />
                        <SoftButton type="submit">Reverse</SoftButton>
                      </form>
                      <form action={evictMoveInAction}>
                        <input type="hidden" name="id" value={request.id} />
                        <SoftButton type="submit" className="text-red-600 dark:text-red-400">
                          Evict
                        </SoftButton>
                      </form>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </PortalShell>
  )
}
