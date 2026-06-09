import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import { getPropertyById } from '@/lib/properties'
import { adminDeletePropertyAction } from '@/app/actions/admin'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Breadcrumbs } from '@/components/elements/breadcrumbs'
import { SoftButton } from '@/components/elements/button'
import { PropertyEditForm } from '@/components/admin/property-edit-form'

export const metadata: Metadata = { title: 'Edit property' }

export default async function AdminPropertyEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('admin', '/admin/login')
  const { id } = await params

  const property = await getPropertyById(id)
  if (!property) notFound()

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Breadcrumbs
            className="mb-2"
            items={[
              { label: 'Admin dashboard', href: '/admin' },
              { label: 'Property review', href: '/admin/properties' },
              { label: 'Edit property' },
            ]}
          />
          <Eyebrow>Administration</Eyebrow>
          <Subheading className="text-3xl/9 sm:text-4xl/12">Edit property</Subheading>
        </div>

        <Card className="p-8 sm:p-10">
          <PropertyEditForm property={property} />
        </Card>

        <Card className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Delete property</h3>
          <Text className="text-sm/6">
            <p>Permanently delete this property (admin override — works for any status). This cannot be undone.</p>
          </Text>
          <form action={adminDeletePropertyAction}>
            <input type="hidden" name="id" value={property.id} />
            <SoftButton type="submit" className="text-red-600 dark:text-red-400">
              Delete property
            </SoftButton>
          </form>
        </Card>
      </Container>
    </section>
  )
}
