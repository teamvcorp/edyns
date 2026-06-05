import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listPartners } from '@/lib/users'
import { propertyCountsByPartner } from '@/lib/properties'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { Link } from '@/components/elements/link'

export const metadata: Metadata = { title: 'Partners' }

export default async function AdminPartnersPage() {
  await requireRole('admin', '/admin/login')
  const [partners, counts] = await Promise.all([listPartners(), propertyCountsByPartner()])

  return (
    <PortalShell eyebrow="Administration" title={`Partners (${partners.length})`}>
      {partners.length === 0 ? (
        <Card>
          <Text className="text-sm/6">
            <p>No partner accounts yet.</p>
          </Text>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {partners.map((p) => (
            <Card key={p.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="flex flex-col">
                <span className="font-medium text-olive-950 dark:text-white">{p.name}</span>
                <span className="text-sm text-olive-600 dark:text-olive-500">
                  {p.email} · {p.phone ?? 'no phone'}
                </span>
              </div>
              <div className="flex items-center gap-6">
                <span className="text-sm text-olive-600 dark:text-olive-500">
                  {counts[p.id] ?? 0} propert{(counts[p.id] ?? 0) === 1 ? 'y' : 'ies'}
                </span>
                <Link href={`/admin/partners/${p.id}`}>Manage</Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PortalShell>
  )
}
