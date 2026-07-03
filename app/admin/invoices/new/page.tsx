import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listPartners } from '@/lib/users'
import { createInvoiceAction } from '@/app/actions/invoices'
import { PortalShell } from '@/components/site/portal-shell'
import { InvoiceForm } from '@/components/admin/invoice-form'

export const metadata: Metadata = { title: 'New invoice' }

export default async function NewInvoicePage() {
  await requireRole('admin', '/admin/login')
  const partners = await listPartners()

  return (
    <PortalShell
      eyebrow="Administration"
      title="New project invoice"
      breadcrumbs={[
        { label: 'Admin dashboard', href: '/admin' },
        { label: 'Invoices', href: '/admin/invoices' },
        { label: 'New' },
      ]}
    >
      <InvoiceForm
        action={createInvoiceAction}
        mode="create"
        partners={partners.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
      />
    </PortalShell>
  )
}
