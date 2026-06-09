import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listAllProperties } from '@/lib/properties'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { PropertyReviewCard } from '@/components/admin/property-review-card'

export const metadata: Metadata = { title: 'Property review' }

export default async function AdminPropertiesPage() {
  await requireRole('admin', '/admin/login')
  const all = await listAllProperties()

  const pending = all.filter((p) => p.status === 'pending')
  const decided = all.filter((p) => p.status !== 'pending')

  return (
    <PortalShell
      eyebrow="Administration"
      title="Property review"
      breadcrumbs={[{ label: 'Admin dashboard', href: '/admin' }, { label: 'Property review' }]}
    >
      <div className="flex flex-col gap-6">
        <Subheading className="text-2xl/8">Pending approval ({pending.length})</Subheading>
        {pending.length === 0 ? (
          <Card>
            <Text className="text-sm/6">
              <p>No properties awaiting review.</p>
            </Text>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {pending.map((p) => (
              <PropertyReviewCard key={p.id} property={p} />
            ))}
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <div className="flex flex-col gap-6">
          <Subheading className="text-2xl/8">Decided ({decided.length})</Subheading>
          <div className="grid gap-6 lg:grid-cols-2">
            {decided.map((p) => (
              <PropertyReviewCard key={p.id} property={p} />
            ))}
          </div>
        </div>
      )}
    </PortalShell>
  )
}
