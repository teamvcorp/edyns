import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getInvoiceByToken } from '@/lib/invoices'
import {
  acceptInvoiceByToken,
  declineInvoiceByToken,
  startInvoicePaymentByToken,
} from '@/app/actions/invoices'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Button, SoftButton } from '@/components/elements/button'
import { InvoiceSummary } from '@/components/invoices/invoice-summary'
import { formatCurrency } from '@/lib/format'

export const metadata: Metadata = { title: 'Project proposal', robots: { index: false } }

const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 dark:bg-white/5 dark:text-white dark:ring-white/10'

const banner: Record<string, { text: string; tone: 'ok' | 'warn' }> = {
  accepted: { text: 'Thanks — you’ve accepted this proposal. Choose a payment option below to begin.', tone: 'ok' },
  declined: { text: 'You’ve declined this proposal. Thank you for letting us know.', tone: 'warn' },
  canceled: { text: 'Payment canceled. You can try again whenever you’re ready.', tone: 'warn' },
  paid: { text: 'This invoice is already paid in full.', tone: 'ok' },
  throttled: { text: 'Too many requests — please wait a moment and try again.', tone: 'warn' },
}

export default async function PublicInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ accepted?: string; declined?: string; canceled?: string; error?: string }>
}) {
  const { token } = await params
  const invoice = await getInvoiceByToken(token)
  if (!invoice || invoice.status === 'draft') notFound()

  const sp = await searchParams
  const bannerKey = sp.error ?? (sp.accepted ? 'accepted' : sp.declined ? 'declined' : sp.canceled ? 'canceled' : undefined)
  const bannerInfo = bannerKey ? banner[bannerKey] : undefined

  const p = invoice.payment
  const remainingCents = Math.max(0, invoice.subtotalCents - p.paidCents)
  const payable = invoice.status === 'accepted' || invoice.status === 'completed'

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-1">
          <Eyebrow>Project proposal</Eyebrow>
          <Subheading className="text-3xl/9 sm:text-4xl/12">{invoice.title}</Subheading>
        </div>

        {bannerInfo && (
          <p
            role="status"
            className={bannerInfo.tone === 'ok' ? 'text-sm text-olive-700 dark:text-olive-300' : 'text-sm text-red-600 dark:text-red-400'}
          >
            {bannerInfo.text}
          </p>
        )}

        <Card>
          <InvoiceSummary invoice={invoice} />
        </Card>

        {/* Respond (only while awaiting a response) */}
        {invoice.status === 'sent' && (
          <Card className="flex flex-col gap-5">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Your response</h3>
            <div className="flex flex-wrap items-start gap-4">
              <form action={acceptInvoiceByToken}>
                <input type="hidden" name="token" value={token} />
                <Button type="submit" size="lg">
                  Accept proposal
                </Button>
              </form>
              <form action={declineInvoiceByToken} className="flex flex-1 flex-col gap-2">
                <input type="hidden" name="token" value={token} />
                <textarea
                  name="note"
                  rows={2}
                  placeholder="Optional: reason or changes you’d like (leave blank to simply decline)"
                  className={inputClass}
                />
                <SoftButton type="submit" size="lg" className="w-fit text-red-600 dark:text-red-400">
                  Decline
                </SoftButton>
              </form>
            </div>
          </Card>
        )}

        {/* Pay */}
        {payable && (
          <Card className="flex flex-col gap-5">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Payment</h3>
            {p.status === 'paid' ? (
              <p className="text-sm text-olive-700 dark:text-olive-300">Paid in full — thank you!</p>
            ) : p.status === 'deposit_paid' ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-olive-700 dark:text-olive-300">
                  Deposit received. Balance due: <strong>{formatCurrency(remainingCents / 100)}</strong>
                  {invoice.status !== 'completed' && ' (payable now or on completion)'}.
                </p>
                <form action={startInvoicePaymentByToken}>
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="phase" value="balance" />
                  <Button type="submit" size="lg">
                    Pay balance ({formatCurrency(remainingCents / 100)})
                  </Button>
                </form>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <form action={startInvoicePaymentByToken}>
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="phase" value="full" />
                  <Button type="submit" size="lg">
                    Pay in full ({formatCurrency(invoice.subtotalCents / 100)})
                  </Button>
                </form>
                <form action={startInvoicePaymentByToken}>
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="phase" value="deposit" />
                  <SoftButton type="submit" size="lg">
                    Pay 50% deposit ({formatCurrency(p.depositCents / 100)})
                  </SoftButton>
                </form>
              </div>
            )}
            <p className="text-xs text-olive-600 dark:text-olive-400">
              A card/bank processing fee is added at checkout. Work begins once your deposit clears.
            </p>
          </Card>
        )}

        {/* Completed evidence */}
        {invoice.status === 'completed' && invoice.finishedPhotoUrl && (
          <Card className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Completed work</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={invoice.finishedPhotoUrl}
              alt="Completed work"
              className="w-full max-w-sm rounded-lg object-cover ring-1 ring-olive-950/10 dark:ring-white/10"
            />
          </Card>
        )}

        {invoice.status === 'declined' && (
          <Card>
            <p className="text-sm text-olive-700 dark:text-olive-300">
              You declined this proposal. If this was a mistake or you’d like changes, please reply to the email you
              received.
            </p>
          </Card>
        )}
      </Container>
    </section>
  )
}
