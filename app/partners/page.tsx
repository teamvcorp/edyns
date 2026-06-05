import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { findPartnerById } from '@/lib/users'
import { listPropertiesByPartner } from '@/lib/properties'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { ButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { formatAddress, formatCurrency } from '@/lib/format'

export const metadata: Metadata = { title: 'Partner portal' }

export default async function PartnerPortalPage() {
  const session = await requireRole('partner', '/partners/login')
  const [profile, properties] = await Promise.all([
    findPartnerById(session.sub),
    listPropertiesByPartner(session.sub),
  ])

  const counts = {
    total: properties.length,
    pending: properties.filter((p) => p.status === 'pending').length,
    approved: properties.filter((p) => p.status === 'approved').length,
  }
  const totalEquity = properties
    .filter((p) => p.status === 'approved')
    .reduce((sum, p) => sum + (p.equityGenerated ?? 0), 0)

  return (
    <PortalShell eyebrow="Partner portal" title={`Welcome, ${session.name ?? 'partner'}`}>
      {/* Properties summary */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Properties</h3>
          <ButtonLink href="/partners/properties">Manage properties</ButtonLink>
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-olive-600 dark:text-olive-500">Total</dt>
            <dd className="font-display text-3xl text-olive-950 dark:text-white">{counts.total}</dd>
          </div>
          <div>
            <dt className="text-sm text-olive-600 dark:text-olive-500">Pending</dt>
            <dd className="font-display text-3xl text-olive-950 dark:text-white">{counts.pending}</dd>
          </div>
          <div>
            <dt className="text-sm text-olive-600 dark:text-olive-500">Approved</dt>
            <dd className="font-display text-3xl text-olive-950 dark:text-white">{counts.approved}</dd>
          </div>
          <div>
            <dt className="text-sm text-olive-600 dark:text-olive-500">Equity generated</dt>
            <dd className="font-display text-3xl text-olive-950 dark:text-white">{formatCurrency(totalEquity)}</dd>
          </div>
        </dl>
        <Link href="/partners/properties/new">+ Add a property</Link>
      </Card>

      {profile && (
        <Card className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Your details</h3>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col">
              <dt className="text-olive-600 dark:text-olive-500">Email</dt>
              <dd className="text-olive-950 dark:text-white">{profile.email}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-olive-600 dark:text-olive-500">Phone</dt>
              <dd className="text-olive-950 dark:text-white">{profile.phone ?? '—'}</dd>
            </div>
            <div className="flex flex-col sm:col-span-2">
              <dt className="text-olive-600 dark:text-olive-500">Billing address</dt>
              <dd className="text-olive-950 dark:text-white">{formatAddress(profile.billingAddress)}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-olive-600 dark:text-olive-500">Tax ID</dt>
              <dd className="text-olive-950 dark:text-white">
                {profile.taxIdLast4 ? `•••• ${profile.taxIdLast4}` : '—'}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Equity & payouts</h3>
        <Text className="text-sm/6">
          <p>
            Track your 10% stake and resale payouts here. Connecting your account for transfers (Stripe Connect) is
            coming soon.
          </p>
        </Text>
        <span className="mt-2 text-sm font-medium text-olive-600 dark:text-olive-500">Coming soon</span>
      </Card>
    </PortalShell>
  )
}
