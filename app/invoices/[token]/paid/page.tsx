import type { Metadata } from 'next'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { ButtonLink } from '@/components/elements/button'
import { getStripe } from '@/lib/stripe'
import { recordInvoicePayment, type PaymentPhase } from '@/lib/invoices'

export const metadata: Metadata = { title: 'Payment received', robots: { index: false } }

/**
 * Stripe Checkout success return for a project invoice. We retrieve the session
 * and finalize payment immediately (card = paid now; bank/ACH = processing until
 * it settles, which the webhook later flips to paid). Reconciliation here mirrors
 * the tenant fee flow and is idempotent with the webhook.
 */
export default async function InvoicePaidPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ session_id?: string }>
}) {
  const { token } = await params
  const { session_id } = await searchParams

  let heading = 'Payment received'
  let body = 'Thank you — your payment has been recorded.'

  if (session_id) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(session_id)
      const meta = session.metadata ?? {}
      const paid = session.payment_status === 'paid'
      if (meta.type === 'project_invoice' && meta.invoiceId && meta.phase) {
        await recordInvoicePayment(meta.invoiceId, session.id, meta.phase as PaymentPhase, paid)
      }
      if (!paid) {
        heading = 'Payment processing'
        body = 'Your bank payment is processing and will be confirmed shortly. Work begins once it clears.'
      }
    } catch {
      heading = 'Thanks'
      body = 'We’re confirming your payment. This can take a moment for bank transfers.'
    }
  }

  return (
    <section className="py-16">
      <Container className="flex max-w-xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Eyebrow>edynsgate</Eyebrow>
          <Subheading className="text-3xl/9 sm:text-4xl/12">{heading}</Subheading>
        </div>
        <Card className="flex flex-col gap-4">
          <Text className="text-sm/6">
            <p>{body}</p>
          </Text>
          <ButtonLink href={`/invoices/${token}`} className="w-fit">
            Back to invoice
          </ButtonLink>
        </Card>
      </Container>
    </section>
  )
}
