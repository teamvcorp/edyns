import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listAllInvoices, type Invoice, type PaymentStatus } from '@/lib/invoices'
import { deleteInvoiceAction } from '@/app/actions/invoices'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { ButtonLink, SoftButton } from '@/components/elements/button'
import { formatCurrency } from '@/lib/format'

export const metadata: Metadata = { title: 'Project invoices' }

const paymentLabel: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  deposit_paid: '50% deposit paid',
  paid: 'Paid in full',
}

const banner: Record<string, string> = {
  deleted: 'Invoice deleted.',
}

function InvoiceRow({ invoice, deletable }: { invoice: Invoice; deletable?: boolean }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 py-4">
      <div className="flex flex-col">
        <span className="font-medium text-olive-950 dark:text-white">
          {formatCurrency(invoice.subtotalCents / 100)} · {invoice.title}
        </span>
        <span className="text-sm text-olive-600 dark:text-olive-500">
          {invoice.recipient.name} · {invoice.recipient.email}
        </span>
        {(invoice.status === 'accepted' || invoice.status === 'completed') && (
          <span className="text-sm text-olive-700 dark:text-olive-300">{paymentLabel[invoice.payment.status]}</span>
        )}
        {invoice.status === 'declined' && invoice.declineNote && (
          <span className="text-sm text-red-600 dark:text-red-400">“{invoice.declineNote}”</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {deletable && (
          <form action={deleteInvoiceAction}>
            <input type="hidden" name="id" value={invoice.id} />
            <SoftButton type="submit" className="text-red-600 dark:text-red-400">
              Delete
            </SoftButton>
          </form>
        )}
        <ButtonLink href={`/admin/invoices/${invoice.id}`}>Open</ButtonLink>
      </div>
    </Card>
  )
}

function Group({ title, invoices, deletable }: { title: string; invoices: Invoice[]; deletable?: boolean }) {
  if (invoices.length === 0) return null
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold text-olive-950 dark:text-white">
        {title} ({invoices.length})
      </h3>
      {invoices.map((inv) => (
        <InvoiceRow key={inv.id} invoice={inv} deletable={deletable} />
      ))}
    </div>
  )
}

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>
}) {
  await requireRole('admin', '/admin/login')
  const sp = await searchParams
  const invoices = await listAllInvoices()

  const drafts = invoices.filter((i) => i.status === 'draft')
  const awaiting = invoices.filter((i) => i.status === 'sent')
  const active = invoices.filter((i) => i.status === 'accepted')
  const completed = invoices.filter((i) => i.status === 'completed')
  const declined = invoices.filter((i) => i.status === 'declined')

  const bannerText = sp.deleted ? banner.deleted : undefined

  return (
    <PortalShell
      eyebrow="Administration"
      title={`Project invoices (${invoices.length})`}
      breadcrumbs={[{ label: 'Admin dashboard', href: '/admin' }, { label: 'Invoices' }]}
    >
      {bannerText && (
        <p role="status" className="text-sm text-olive-700 dark:text-olive-300">
          {bannerText}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text className="text-sm/6">
          <p>Propose paid work, collect payment, and track projects to completion.</p>
        </Text>
        <ButtonLink href="/admin/invoices/new">New invoice</ButtonLink>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <Text className="text-sm/6">
            <p>No invoices yet. Create one to get started.</p>
          </Text>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          <Group title="Drafts" invoices={drafts} deletable />
          <Group title="Awaiting response" invoices={awaiting} />
          <Group title="Active / in progress" invoices={active} />
          <Group title="Completed" invoices={completed} />
          <Group title="Declined" invoices={declined} deletable />
        </div>
      )}
    </PortalShell>
  )
}
