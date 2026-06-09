import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Breadcrumbs } from '@/components/elements/breadcrumbs'
import { PropertyForm } from '@/components/partners/property-form'

export const metadata: Metadata = { title: 'Add property' }

export default async function NewPropertyPage() {
  await requireRole('partner', '/partners/login')

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Breadcrumbs
            className="mb-2"
            items={[
              { label: 'Partner portal', href: '/partners' },
              { label: 'My properties', href: '/partners/properties' },
              { label: 'Add a property' },
            ]}
          />
          <Eyebrow>Partner portal</Eyebrow>
          <Subheading className="text-3xl/9 sm:text-4xl/12">Add a property</Subheading>
          <Text className="text-pretty">
            <p>
              Submit a property for review. Because equity is involved, every property is saved as pending until an admin
              approves it.
            </p>
          </Text>
        </div>

        <Card className="p-8 sm:p-10">
          <PropertyForm />
        </Card>
      </Container>
    </section>
  )
}
