import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listTenants } from '@/lib/tenants'
import { listApprovedProperties } from '@/lib/properties'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Breadcrumbs } from '@/components/elements/breadcrumbs'
import { StripeImportForm } from '@/components/admin/stripe-import-form'
import { formatAddress } from '@/lib/format'

export const metadata: Metadata = { title: 'Import from Stripe' }

const errorCopy: Record<string, string> = {
  missing: 'Select a tenant, paste a subscription id, and choose a property.',
  tenant: 'That tenant could not be found.',
  linked: 'That subscription is already linked to another tenant.',
  stripe: 'That Stripe subscription could not be imported.',
  property: 'Choose an approved property to associate.',
}

export default async function AdminImportStripePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireRole('admin', '/admin/login')
  const { error } = await searchParams

  const [tenants, properties] = await Promise.all([listTenants(), listApprovedProperties()])
  // Candidates: tenants without rent billing yet (the one-offs needing reconciliation).
  const candidates = tenants
    .filter((t) => !t.billing)
    .map((t) => ({ id: t.id, name: t.name, email: t.email, household: 1 + t.adults.length + t.children.length }))
  const propertyOptions = properties.map((p) => ({
    id: p.id,
    label: `${formatAddress(p.address)} · Tier ${p.tier ?? 0}`,
  }))

  return (
    <section className="py-16">
      <Container className="flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Breadcrumbs
            className="mb-2"
            items={[
              { label: 'Admin dashboard', href: '/admin' },
              { label: 'Tenant applications', href: '/admin/tenants' },
              { label: 'Import from Stripe' },
            ]}
          />
          <Eyebrow>Administration</Eyebrow>
          <Subheading className="text-3xl/9 sm:text-4xl/12">Import a Stripe subscription</Subheading>
          <Text className="text-pretty">
            <p>
              For one-off tenants whose rent was set up directly in Stripe. Pick the person, paste their existing
              subscription id to pull the live amount and schedule, then associate it with the right property.
            </p>
          </Text>
        </div>

        {error && errorCopy[error] && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {errorCopy[error]}
          </p>
        )}

        <Card className="p-8 sm:p-10">
          {candidates.length === 0 ? (
            <Text className="text-sm/6">
              <p>
                Every tenant already has rent set up. Add the tenant’s paper application first if they’re not in the
                system yet.
              </p>
            </Text>
          ) : (
            <StripeImportForm tenants={candidates} properties={propertyOptions} />
          )}
        </Card>
      </Container>
    </section>
  )
}
