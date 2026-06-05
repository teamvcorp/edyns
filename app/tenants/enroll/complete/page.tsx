import type { Metadata } from 'next'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { ButtonLink } from '@/components/elements/button'
import { getStripe } from '@/lib/stripe'
import { applyFeeResult } from '@/lib/tenants'

export const metadata: Metadata = { title: 'Application submitted' }

/**
 * Stripe Checkout success return. We retrieve the session and finalize the fee
 * status (card = paid immediately; bank/ACH = processing until it settles, which
 * the webhook later flips to paid).
 */
export default async function TenantEnrollCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const { session_id } = await searchParams

  let heading = 'Application submitted'
  let body = 'Your application is pending review by our team.'

  if (session_id) {
    try {
      const stripe = getStripe()
      const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ['payment_intent'] })
      const pi = session.payment_intent as { id: string; payment_method?: string } | null
      const paid = session.payment_status === 'paid'

      await applyFeeResult(session_id, {
        status: paid ? 'paid' : 'processing',
        paymentIntentId: pi?.id,
        paymentMethodId: typeof pi?.payment_method === 'string' ? pi.payment_method : undefined,
      })

      if (paid) {
        heading = 'Payment received'
        body = 'Thanks! Your $25 application fee is paid and your application is pending review.'
      } else {
        heading = 'Payment processing'
        body = 'Your bank payment is processing. Your application is pending review and we’ll confirm the fee shortly.'
      }
    } catch {
      body = 'We couldn’t confirm your payment automatically. If you completed it, it will update shortly.'
    }
  }

  return (
    <section className="py-20 sm:py-28">
      <Container className="flex max-w-xl flex-col">
        <Card className="flex flex-col items-start gap-4 p-8 sm:p-10">
          <Eyebrow>Tenant application</Eyebrow>
          <Subheading className="text-3xl/9">{heading}</Subheading>
          <Text className="text-pretty">
            <p>{body}</p>
          </Text>
          <ButtonLink href="/tenants" size="lg">
            Go to my portal
          </ButtonLink>
        </Card>
      </Container>
    </section>
  )
}
