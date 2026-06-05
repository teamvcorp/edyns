import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listAllProperties } from '@/lib/properties'
import { listTenants } from '@/lib/tenants'
import { listAllRequests } from '@/lib/moveins'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { ButtonLink } from '@/components/elements/button'

export const metadata: Metadata = { title: 'Admin' }

const comingSoon = [{ title: 'Settings', body: 'Configure platform-wide settings and integrations.' }]

export default async function AdminPage() {
  await requireRole('admin', '/admin/login')
  const [properties, tenants, requests] = await Promise.all([listAllProperties(), listTenants(), listAllRequests()])
  const pending = properties.filter((p) => p.status === 'pending').length
  const pendingTenants = tenants.filter((t) => t.status === 'pending').length
  const pendingMoveIns = requests.filter((r) => r.status === 'requested').length

  return (
    <PortalShell eyebrow="Administration" title="Admin dashboard">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Property review</h3>
            <Text className="text-sm/6">
              <p>
                {pending} propert{pending === 1 ? 'y' : 'ies'} awaiting approval.
              </p>
            </Text>
          </div>
          <ButtonLink href="/admin/properties">Review properties</ButtonLink>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Tenant applications</h3>
            <Text className="text-sm/6">
              <p>
                {pendingTenants} application{pendingTenants === 1 ? '' : 's'} awaiting review.
              </p>
            </Text>
          </div>
          <ButtonLink href="/admin/tenants">Review applications</ButtonLink>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Move-in requests</h3>
            <Text className="text-sm/6">
              <p>
                {pendingMoveIns} request{pendingMoveIns === 1 ? '' : 's'} awaiting review.
              </p>
            </Text>
          </div>
          <ButtonLink href="/admin/move-ins">Review move-ins</ButtonLink>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Partners</h3>
            <Text className="text-sm/6">
              <p>Manage and edit property-partner accounts.</p>
            </Text>
          </div>
          <ButtonLink href="/admin/partners">Manage partners</ButtonLink>
        </div>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {comingSoon.map((c) => (
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
