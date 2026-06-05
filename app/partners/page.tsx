import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'

export const metadata: Metadata = { title: 'Partner portal' }

const cards = [
  { title: 'Properties', body: 'Add and manage the buildings you contribute to the network.' },
  { title: 'Tenancies', body: 'Track occupancy and tenant outcomes across your portfolio.' },
  { title: 'Sustainability', body: 'Monitor efficiency incentives and reporting.' },
]

export default async function PartnerPortalPage() {
  const session = await requireRole('partner', '/partners/login')

  return (
    <PortalShell eyebrow="Partner portal" title={`Welcome, ${session.name ?? 'partner'}`}>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.title} className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">{c.title}</h3>
            <Text className="text-sm/6">
              <p>{c.body}</p>
            </Text>
            <span className="mt-2 text-sm font-medium text-olive-600 dark:text-olive-500">Coming soon</span>
          </Card>
        ))}
      </div>
    </PortalShell>
  )
}
