import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Breadcrumbs } from '@/components/elements/breadcrumbs'
import { EnrollForm } from '@/components/auth/enroll-form'
import { createPartnerByAdmin } from '@/app/actions/admin-create'

export const metadata: Metadata = { title: 'Add partner' }

export default async function AdminNewPartnerPage() {
  await requireRole('admin', '/admin/login')

  return (
    <section className="py-16">
      <Container className="flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Breadcrumbs
            className="mb-2"
            items={[
              { label: 'Admin dashboard', href: '/admin' },
              { label: 'Partners', href: '/admin/partners' },
              { label: 'Add partner' },
            ]}
          />
          <Eyebrow>Administration</Eyebrow>
          <Subheading className="text-3xl/9 sm:text-4xl/12">Add a property partner</Subheading>
          <Text className="text-pretty">
            <p>
              Enter a paper application. Set a temporary password — the partner is emailed their credentials and a
              sign-in link. Partners have no application fee.
            </p>
          </Text>
        </div>

        <Card className="p-8 sm:p-10">
          <EnrollForm action={createPartnerByAdmin} mode="admin" />
        </Card>
      </Container>
    </section>
  )
}
