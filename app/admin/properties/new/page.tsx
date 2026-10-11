import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listPartners } from '@/lib/users'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Link } from '@/components/elements/link'
import { Breadcrumbs } from '@/components/elements/breadcrumbs'
import { PropertyEditForm } from '@/components/admin/property-edit-form'

export const metadata: Metadata = { title: 'Add property' }

export default async function AdminNewPropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string }>
}) {
  await requireRole('admin', '/admin/login')
  const { partner } = await searchParams
  const partners = await listPartners()

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Breadcrumbs
            className="mb-2"
            items={[
              { label: 'Admin dashboard', href: '/admin' },
              { label: 'Property review', href: '/admin/properties' },
              { label: 'Add property' },
            ]}
          />
          <Eyebrow>Administration</Eyebrow>
          <Subheading className="text-3xl/9 sm:text-4xl/12">Add a property</Subheading>
          <Text className="text-pretty">
            <p>
              Take in a property on a partner’s behalf. Choose the owner, then either save it as pending or approve it
              now — an approved property needs its tier, income requirement and equity set. The partner will see it when
              they sign in.
            </p>
            <p>
              Owner not listed? <Link href="/admin/partners/new">Add the partner first</Link>.
            </p>
          </Text>
        </div>

        <Card className="p-8 sm:p-10">
          <PropertyEditForm
            partners={partners.map((p) => ({ id: p.id, label: `${p.name} (${p.email})` }))}
            defaultPartnerId={partner}
          />
        </Card>
      </Container>
    </section>
  )
}
