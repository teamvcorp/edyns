import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { repairablePropertiesFor, listRepairsByRequester } from '@/lib/repairs'
import { getPropertyById } from '@/lib/properties'
import { formatAddress } from '@/lib/format'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { RepairRequestForm } from '@/components/repairs/repair-request-form'
import { RepairList } from '@/components/repairs/repair-list'

export const metadata: Metadata = { title: 'Repairs' }

export default async function TenantRepairsPage() {
  const session = await requireRole('tenant', '/tenants/login')
  // Tenants may only request repairs for the home they live in / pay rent on.
  const [homes, repairs] = await Promise.all([repairablePropertiesFor(session), listRepairsByRequester(session.sub)])

  // Addresses for the form AND for past requests (which may be for a previous home).
  const ids = [...new Set([...homes.map((h) => h.id), ...repairs.map((r) => r.propertyId)])]
  const props = await Promise.all(ids.map((id) => getPropertyById(id)))
  const addresses = Object.fromEntries(
    props.filter((p) => p !== null).map((p) => [p.id, formatAddress(p.address)]),
  )

  return (
    <PortalShell
      eyebrow="Tenant portal"
      title="Repairs"
      breadcrumbs={[{ label: 'Tenant portal', href: '/tenants' }, { label: 'Repairs' }]}
    >
      <Card className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Request a repair</h3>
        {homes.length === 0 ? (
          <Text className="text-sm/6">
            <p>Repair requests open once you’ve moved into your edynsgate home.</p>
          </Text>
        ) : (
          <RepairRequestForm properties={homes.map((h) => ({ id: h.id, label: addresses[h.id] }))} />
        )}
      </Card>

      <Card className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Your requests</h3>
        <RepairList repairs={repairs} addresses={addresses} viewerId={session.sub} />
      </Card>
    </PortalShell>
  )
}
