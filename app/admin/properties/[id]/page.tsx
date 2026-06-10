import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import { getPropertyById } from '@/lib/properties'
import { findTenantByProperty } from '@/lib/tenants'
import { adminDeletePropertyAction, addCashRentPaymentAction } from '@/app/actions/admin'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Breadcrumbs } from '@/components/elements/breadcrumbs'
import { Button, SoftButton } from '@/components/elements/button'
import { PropertyEditForm } from '@/components/admin/property-edit-form'

export const metadata: Metadata = { title: 'Edit property' }

const cashCopy: Record<string, { text: string; tone: 'ok' | 'warn' }> = {
  recorded: { text: 'Cash rent payment recorded — equity credited to the partner.', tone: 'ok' },
  amount: { text: 'Enter a rent amount greater than zero.', tone: 'warn' },
  date: { text: 'Enter a valid payment date.', tone: 'warn' },
  'no-tenant': { text: 'No tenant is currently placed at this property.', tone: 'warn' },
  error: { text: 'Cash payments can only be recorded on an approved property.', tone: 'warn' },
}

const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10'

export default async function AdminPropertyEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ cash?: string }>
}) {
  await requireRole('admin', '/admin/login')
  const { id } = await params
  const { cash } = await searchParams

  const property = await getPropertyById(id)
  if (!property) notFound()

  const tenant = property.status === 'approved' ? await findTenantByProperty(id) : null
  const cashInfo = cash ? cashCopy[cash] : undefined

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

        {property.status === 'approved' && (
          <Card className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Record cash rent payment</h3>
            {cashInfo && (
              <p
                role="status"
                className={
                  cashInfo.tone === 'ok'
                    ? 'text-sm text-olive-700 dark:text-olive-300'
                    : 'text-sm text-red-600 dark:text-red-400'
                }
              >
                {cashInfo.text}
              </p>
            )}
            <Text className="text-sm/6">
              <p>
                For rent paid in cash (e.g. an auto-draft failed). Credits partner equity the same way an automatic
                payment does — {property.equitySharePercent ?? 10}% of the amount — and is logged as a cash payment.
              </p>
            </Text>
            {tenant ? (
              <form action={addCashRentPaymentAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="propertyId" value={property.id} />
                <label className="flex flex-col gap-1 text-sm font-medium text-olive-950 dark:text-white">
                  Rent amount (USD)
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="e.g. 720.00"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-olive-950 dark:text-white">
                  Date paid
                  <input name="paidAt" type="date" className={inputClass} />
                </label>
                <Button type="submit">Record payment</Button>
              </form>
            ) : (
              <Text className="text-sm/6">
                <p>No tenant is placed at this property yet, so there’s no one to credit a cash payment against.</p>
              </Text>
            )}
          </Card>
        )}

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
