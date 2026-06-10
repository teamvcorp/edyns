import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listPropertiesByPartner } from '@/lib/properties'
import { isPropertyRented } from '@/lib/tenants'
import { listEquityEntriesByProperty } from '@/lib/equity'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { ButtonLink } from '@/components/elements/button'
import { PropertyCard } from '@/components/partners/property-card'

export const metadata: Metadata = { title: 'My properties' }

const reportBanner: Record<string, { text: string; tone: 'ok' | 'warn' }> = {
  sent: { text: 'Equity report emailed to you.', tone: 'ok' },
  failed: { text: 'Could not send the report email. Please try again.', tone: 'warn' },
}

export default async function PartnerPropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string }>
}) {
  const session = await requireRole('partner', '/partners/login')
  const { report } = await searchParams
  const properties = await listPropertiesByPartner(session.sub)

  // Per-property rented status + equity ledger entries (only meaningful once approved).
  const cards = await Promise.all(
    properties.map(async (p) => {
      if (p.status !== 'approved') return { property: p, rented: false, entries: [] }
      const [rented, entries] = await Promise.all([isPropertyRented(p.id), listEquityEntriesByProperty(p.id)])
      return { property: p, rented, entries }
    }),
  )

  const banner = report ? reportBanner[report] : undefined

  return (
    <PortalShell
      eyebrow="Partner portal"
      title="My properties"
      breadcrumbs={[{ label: 'Partner portal', href: '/partners' }, { label: 'My properties' }]}
    >
      {banner && (
        <p
          role="status"
          className={
            banner.tone === 'ok'
              ? 'text-sm text-olive-700 dark:text-olive-300'
              : 'text-sm text-red-600 dark:text-red-400'
          }
        >
          {banner.text}
        </p>
      )}

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
          {cards.map(({ property, rented, entries }) => (
            <PropertyCard key={property.id} property={property} rented={rented} equityEntries={entries} />
          ))}
        </div>
      )}
    </PortalShell>
  )
}
