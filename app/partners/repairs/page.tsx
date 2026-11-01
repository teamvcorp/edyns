import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listPropertiesByPartner } from '@/lib/properties'
import { listRepairsForProperties, toPartnerView } from '@/lib/repairs'
import { formatAddress } from '@/lib/format'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { RepairRequestForm } from '@/components/repairs/repair-request-form'
import { RepairList } from '@/components/repairs/repair-list'

export const metadata: Metadata = { title: 'Repairs' }

export default async function PartnerRepairsPage() {
  const session = await requireRole('partner', '/partners/login')
  const properties = await listPropertiesByPartner(session.sub)
  // Requests are only allowed on APPROVED properties (lib/repairs.ts repairablePropertiesFor).
  const approved = properties.filter((p) => p.status === 'approved')
  // Show every request on properties they own now — tenant identity stripped.
  const repairs = (await listRepairsForProperties(properties.map((p) => p.id))).map((r) =>
    toPartnerView(r, session.sub),
  )
  const addresses = Object.fromEntries(properties.map((p) => [p.id, formatAddress(p.address)]))

  return (
    <PortalShell
      eyebrow="Partner portal"
      title="Repairs"
      breadcrumbs={[{ label: 'Partner portal', href: '/partners' }, { label: 'Repairs' }]}
    >
      <Card className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Request a repair</h3>
        {approved.length === 0 ? (
          <Text className="text-sm/6">
            <p>Repair requests open once one of your properties has been approved into the program.</p>
          </Text>
        ) : (
          <RepairRequestForm properties={approved.map((p) => ({ id: p.id, label: addresses[p.id] }))} />
        )}
      </Card>

      <Card className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Requests on your properties</h3>
        <Text className="text-sm/6">
          <p>Includes requests from your tenants. Tenant contact details stay with our team.</p>
        </Text>
        <RepairList repairs={repairs} addresses={addresses} viewerId={session.sub} />
      </Card>
    </PortalShell>
  )
}
