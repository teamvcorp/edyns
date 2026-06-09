import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { PlaidOAuthReturn } from '@/components/tenants/plaid-oauth-return'

export const metadata: Metadata = { title: 'Finishing verification' }

/** Plaid OAuth redirect target — only reachable by a signed-in tenant. */
export default async function PlaidOAuthPage() {
  await requireRole('tenant', '/tenants/login')
  return (
    <PortalShell
      eyebrow="Tenant portal"
      title="Bank verification"
      breadcrumbs={[{ label: 'Tenant portal', href: '/tenants' }, { label: 'Bank verification' }]}
    >
      <Card>
        <PlaidOAuthReturn />
      </Card>
    </PortalShell>
  )
}
