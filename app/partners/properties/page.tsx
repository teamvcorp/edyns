import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listPropertiesByPartner } from '@/lib/properties'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { ButtonLink } from '@/components/elements/button'
import { PropertyCard } from '@/components/partners/property-card'

export const metadata: Metadata = { title: 'My properties' }

export default async function PartnerPropertiesPage() {
  const session = await requireRole('partner', '/partners/login')
  const properties = await listPropertiesByPartner(session.sub)

  return (
    <PortalShell
      eyebrow="Partner portal"
      title="My properties"
      breadcrumbs={[{ label: 'Partner portal', href: '/partners' }, { label: 'My properties' }]}
    >
      <div className="flex items-center justify-between">
        <Text className="text-sm/6">
          <p>{properties.length} propert{properties.length === 1 ? 'y' : 'ies'}.</p>
        </Text>
        <ButtonLink href="/partners/properties/new">Add property</ButtonLink>
      </div>

      {properties.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">No properties yet</h3>
          <Text className="text-sm/6">
            <p>Add your first property to start the approval process. It’ll be reviewed before any equity is assigned.</p>
          </Text>
          <ButtonLink href="/partners/properties/new">Add property</ButtonLink>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      )}
    </PortalShell>
  )
}
