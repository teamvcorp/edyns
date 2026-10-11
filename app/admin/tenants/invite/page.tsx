import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listApprovedProperties } from '@/lib/properties'
import { formatAddress } from '@/lib/format'
import { tierLabel } from '@/lib/tiers'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Breadcrumbs } from '@/components/elements/breadcrumbs'
import { TenantInviteForm } from '@/components/admin/tenant-invite-form'

export const metadata: Metadata = { title: 'Invite tenant' }

export default async function AdminInviteTenantPage() {
  await requireRole('admin', '/admin/login')
  const properties = await listApprovedProperties()

  return (
    <section className="py-16">
      <Container className="flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Breadcrumbs
            className="mb-2"
            items={[
              { label: 'Admin dashboard', href: '/admin' },
              { label: 'Tenant applications', href: '/admin/tenants' },
              { label: 'Invite tenant' },
            ]}
          />
          <Eyebrow>Administration</Eyebrow>
          <Subheading className="text-3xl/9 sm:text-4xl/12">Invite a tenant to apply</Subheading>
          <Text className="text-pretty">
            <p>
              Send a personal, single-use link to the application form. The name and email are filled in for them, and
              they finish the rest themselves.
            </p>
          </Text>
        </div>

        <Card className="p-8 sm:p-10">
          <TenantInviteForm
            properties={properties.map((p) => ({
              id: p.id,
              label: `${formatAddress(p.address)} — Tier ${p.tier ?? 0} · ${tierLabel(p.tier)}`,
            }))}
          />
        </Card>
      </Container>
    </section>
  )
}
