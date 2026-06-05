import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'

export const metadata: Metadata = { title: 'Tenant portal' }

const cards = [
  { title: 'My home', body: 'View your tenancy details, documents, and payments.' },
  { title: 'Education', body: 'Browse learning and skills programs available to you.' },
  { title: 'Support', body: 'Get help and connect with your property partner.' },
]

export default async function TenantPortalPage() {
  const session = await requireRole('tenant', '/tenants/login')

  return (
    <PortalShell eyebrow="Tenant portal" title={`Welcome, ${session.name ?? 'tenant'}`}>
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
