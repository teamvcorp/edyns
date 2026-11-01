import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listAllRepairs, REPAIR_STATUSES, STATUS_LABEL, type RepairStatus } from '@/lib/repairs'
import { getPropertyById } from '@/lib/properties'
import { formatAddress } from '@/lib/format'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Breadcrumbs } from '@/components/elements/breadcrumbs'
import { Link } from '@/components/elements/link'
import { RepairList } from '@/components/repairs/repair-list'

export const metadata: Metadata = { title: 'Repair requests' }

export default async function AdminRepairsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole('admin', '/admin/login')
  const { status } = await searchParams
  // Only accept known statuses from the query string; anything else = "all".
  const filter = REPAIR_STATUSES.includes(status as RepairStatus) ? (status as RepairStatus) : undefined

  const repairs = await listAllRepairs(filter) // emergencies first
  const propertyIds = [...new Set(repairs.map((r) => r.propertyId))]
  const props = await Promise.all(propertyIds.map((id) => getPropertyById(id)))
  const addresses = Object.fromEntries(props.filter((p) => p !== null).map((p) => [p.id, formatAddress(p.address)]))

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Breadcrumbs
            className="mb-2"
            items={[{ label: 'Admin dashboard', href: '/admin' }, { label: 'Repair requests' }]}
          />
          <Eyebrow>Administration</Eyebrow>
          <Subheading className="text-3xl/9 sm:text-4xl/12">Repair requests</Subheading>
        </div>

        <nav aria-label="Filter by status" className="flex flex-wrap gap-3 text-sm">
          <Link href="/admin/repairs" className={!filter ? 'font-semibold' : undefined}>
            All
          </Link>
          {REPAIR_STATUSES.map((s) => (
            <Link key={s} href={`/admin/repairs?status=${s}`} className={filter === s ? 'font-semibold' : undefined}>
              {STATUS_LABEL[s]}
            </Link>
          ))}
        </nav>

        <Card>
          <RepairList repairs={repairs} addresses={addresses} adminLinks />
        </Card>
      </Container>
    </section>
  )
}
