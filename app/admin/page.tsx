import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'

export const metadata: Metadata = { title: 'Admin' }

const cards = [
  { title: 'Partners', body: 'Review and manage property partner accounts.' },
  { title: 'Tenants', body: 'Review and manage tenant accounts.' },
  { title: 'Settings', body: 'Configure platform-wide settings and integrations.' },
]

export default async function AdminPage() {
  await requireRole('admin', '/admin/login')

  return (
    <PortalShell eyebrow="Administration" title="Admin dashboard">
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
