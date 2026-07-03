import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import { getInvoiceById, type PaymentStatus, type InvoiceStatus } from '@/lib/invoices'
import { listPartners } from '@/lib/users'
import {
  updateInvoiceAction,
  sendInvoiceAction,
  sendFinalInvoiceAction,
  deleteInvoiceAction,
} from '@/app/actions/invoices'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Button, SoftButton } from '@/components/elements/button'
import { InvoiceForm } from '@/components/admin/invoice-form'
import { CompleteInvoiceForm } from '@/components/admin/complete-invoice-form'
import { InvoiceSummary } from '@/components/invoices/invoice-summary'
import { formatCurrency } from '@/lib/format'

export const metadata: Metadata = { title: 'Invoice' }

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

const statusLabel: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Awaiting response',
  declined: 'Declined',
  accepted: 'Accepted — in progress',
  completed: 'Completed',
}
const paymentLabel: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  deposit_paid: '50% deposit paid',
  paid: 'Paid in full',
}
const banner: Record<string, { text: string; tone: 'ok' | 'warn' }> = {
  sent: { text: 'Email sent to the recipient.', tone: 'ok' },
  saved: { text: 'Changes saved.', tone: 'ok' },
  completed: { text: 'Marked completed — balance requested if unpaid.', tone: 'ok' },
  'email=failed': { text: 'Saved, but the email failed to send (check Resend config).', tone: 'warn' },
  'error=photo': { text: 'Attach a finished-work photo before completing.', tone: 'warn' },
  'error=state': { text: 'Only an accepted invoice can be completed.', tone: 'warn' },
}

export default async function AdminInvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sent?: string; saved?: string; completed?: string; email?: string; error?: string }>
}) {
  await requireRole('admin', '/admin/login')
  const { id } = await params
  const invoice = await getInvoiceById(id)
  if (!invoice) notFound()

  const sp = await searchParams
  const partners = await listPartners()
  const publicUrl = `${baseUrl}/invoices/${invoice.token}`

  const bannerKey = sp.email === 'failed' ? 'email=failed' : sp.error ? `error=${sp.error}` : sp.sent ? 'sent' : sp.saved ? 'saved' : sp.completed ? 'completed' : undefined
  const bannerInfo = bannerKey ? banner[bannerKey] : undefined

  return (
    <PortalShell
      eyebrow="Administration"
      title={invoice.title}
      breadcrumbs={[
        { label: 'Admin dashboard', href: '/admin' },
        { label: 'Invoices', href: '/admin/invoices' },
        { label: invoice.title },
      ]}
    >
      {bannerInfo && (
        <p
          role="status"
          className={bannerInfo.tone === 'ok' ? 'text-sm text-olive-700 dark:text-olive-300' : 'text-sm text-red-600 dark:text-red-400'}
        >
          {bannerInfo.text}
        </p>
      )}

      {/* Status + payment */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-sm text-olive-600 dark:text-olive-400">Status</span>
            <span className="text-lg font-semibold text-olive-950 dark:text-white">{statusLabel[invoice.status]}</span>
          </div>
          <div className="flex flex-col sm:items-end">
            <span className="text-sm text-olive-600 dark:text-olive-400">Payment</span>
            <span className="text-lg font-semibold text-olive-950 dark:text-white">
              {paymentLabel[invoice.payment.status]}
            </span>
          </div>
        </div>
        <div className="grid gap-2 text-sm text-olive-700 dark:text-olive-300 sm:grid-cols-3">
          <span>Total: {formatCurrency(invoice.subtotalCents / 100)}</span>
          <span>Deposit (50%): {formatCurrency(invoice.payment.depositCents / 100)}</span>
          <span>Balance: {formatCurrency(invoice.payment.balanceCents / 100)}</span>
        </div>
        <p className="break-all text-xs text-olive-600 dark:text-olive-400">
          Recipient link: <a className="underline" href={publicUrl}>{publicUrl}</a>
        </p>
        {invoice.status === 'declined' && invoice.declineNote && (
          <p className="text-sm text-red-600 dark:text-red-400">Decline note: “{invoice.declineNote}”</p>
        )}
      </Card>

      {/* Actions */}
      <Card className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Actions</h3>
        <div className="flex flex-wrap items-center gap-2">
          {(invoice.status === 'draft' || invoice.status === 'sent' || invoice.status === 'declined') && (
            <form action={sendInvoiceAction}>
              <input type="hidden" name="id" value={invoice.id} />
              <Button type="submit">{invoice.status === 'draft' ? 'Send to recipient' : 'Resend proposal'}</Button>
            </form>
          )}
          {(invoice.status === 'accepted' || invoice.status === 'completed') && invoice.payment.status !== 'paid' && (
            <form action={sendFinalInvoiceAction}>
              <input type="hidden" name="id" value={invoice.id} />
              <Button type="submit">Resend payment link</Button>
            </form>
          )}
          <form action={deleteInvoiceAction}>
            <input type="hidden" name="id" value={invoice.id} />
            <SoftButton type="submit" className="text-red-600 dark:text-red-400">
              Delete
            </SoftButton>
          </form>
        </div>

        {invoice.status === 'accepted' && (
          <div className="border-t border-olive-950/10 pt-4 dark:border-white/10">
            <CompleteInvoiceForm invoiceId={invoice.id} />
          </div>
        )}

        {invoice.status === 'completed' && invoice.finishedPhotoUrl && (
          <div className="border-t border-olive-950/10 pt-4 dark:border-white/10">
            <span className="mb-2 block text-sm font-medium text-olive-950 dark:text-white">Finished-work photo</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={invoice.finishedPhotoUrl}
              alt="Finished work"
              className="size-40 rounded-lg object-cover ring-1 ring-olive-950/10 dark:ring-white/10"
            />
          </div>
        )}
      </Card>

      {/* Summary */}
      <Card>
        <InvoiceSummary invoice={invoice} />
      </Card>

      {/* Edit */}
      {invoice.status !== 'completed' && (
        <Card className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Edit invoice</h3>
          <InvoiceForm
            action={updateInvoiceAction}
            mode="edit"
            invoice={invoice}
            partners={partners.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
          />
        </Card>
      )}
    </PortalShell>
  )
}
