import type { Metadata } from 'next'
import type Stripe from 'stripe'
import { requireRole } from '@/lib/dal'
import { findPartnerById } from '@/lib/users'
import { totalEquityByPartner } from '@/lib/properties'
import { totalPaidCentsByPartner, pendingCentsByPartner, listPayoutsByPartner } from '@/lib/payouts'
import { getStripe } from '@/lib/stripe'
import { startConnectOnboarding, savePayoutFrequency, requestPayout } from '@/app/actions/payouts'
import { Container } from '@/components/elements/container'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Card } from '@/components/elements/card'
import { Breadcrumbs } from '@/components/elements/breadcrumbs'
import { Button, SoftButton } from '@/components/elements/button'
import { ManualConnectForm } from '@/components/partners/manual-connect-form'
import { formatCurrency } from '@/lib/format'

export const metadata: Metadata = { title: 'Equity & payouts' }

const inputClass =
  'rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10'

const banner: Record<string, { text: string; tone: 'ok' | 'warn' }> = {
  requested: { text: 'Payout request submitted — an admin will review and approve it.', tone: 'ok' },
  freq: { text: 'Payout frequency saved.', tone: 'ok' },
  return: { text: 'Welcome back — your account status is updated below.', tone: 'ok' },
  'not-ready': { text: 'Your connected account isn’t ready for payouts yet.', tone: 'warn' },
  error: { text: 'Something went wrong. Please try again.', tone: 'warn' },
}

const payoutStatusLabel = { requested: 'Pending approval', paid: 'Paid', declined: 'Declined' } as const

export default async function PartnerPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string; freq?: string; return?: string; error?: string }>
}) {
  const session = await requireRole('partner', '/partners/login')
  const sp = await searchParams

  const [partner, totalEquity, paidCents, pendingCents, payouts] = await Promise.all([
    findPartnerById(session.sub),
    totalEquityByPartner(session.sub),
    totalPaidCentsByPartner(session.sub),
    pendingCentsByPartner(session.sub),
    listPayoutsByPartner(session.sub),
  ])

  const availableCents = Math.max(0, Math.round(totalEquity * 100) - paidCents - pendingCents)
  const hasPending = pendingCents > 0

  let account: Stripe.Account | null = null
  if (partner?.stripeAccountId) {
    try {
      account = await getStripe().accounts.retrieve(partner.stripeAccountId)
    } catch {
      account = null
    }
  }
  const hasAccount = Boolean(partner?.stripeAccountId)
  const ready = Boolean(account?.payouts_enabled)
  const frequency = partner?.payoutFrequency ?? 'manual'

  const bannerKey = sp.error ?? (sp.requested ? 'requested' : sp.freq ? 'freq' : sp.return ? 'return' : undefined)
  const bannerInfo = bannerKey ? banner[bannerKey] : undefined

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Breadcrumbs
            className="mb-2"
            items={[{ label: 'Partner portal', href: '/partners' }, { label: 'Equity & payouts' }]}
          />
          <Eyebrow>Partner portal</Eyebrow>
          <Subheading className="text-3xl/9 sm:text-4xl/12">Equity & payouts</Subheading>
        </div>

        {bannerInfo && (
          <p
            role="status"
            className={
              bannerInfo.tone === 'ok'
                ? 'text-sm text-olive-700 dark:text-olive-300'
                : 'text-sm text-red-600 dark:text-red-400'
            }
          >
            {bannerInfo.text}
          </p>
        )}

        {/* Equity summary */}
        <Card className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Your equity</h3>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-sm text-olive-600 dark:text-olive-500">Total generated</dt>
              <dd className="font-display text-3xl text-olive-950 dark:text-white">{formatCurrency(totalEquity)}</dd>
            </div>
            <div>
              <dt className="text-sm text-olive-600 dark:text-olive-500">Paid out</dt>
              <dd className="font-display text-3xl text-olive-950 dark:text-white">{formatCurrency(paidCents / 100)}</dd>
            </div>
            <div>
              <dt className="text-sm text-olive-600 dark:text-olive-500">Pending</dt>
              <dd className="font-display text-3xl text-olive-950 dark:text-white">{formatCurrency(pendingCents / 100)}</dd>
            </div>
            <div>
              <dt className="text-sm text-olive-600 dark:text-olive-500">Available</dt>
              <dd className="font-display text-3xl text-olive-950 dark:text-white">
                {formatCurrency(availableCents / 100)}
              </dd>
            </div>
          </dl>
          {hasPending && (
            <Text className="text-sm/6">
              <p>You have a payout request pending admin approval.</p>
            </Text>
          )}
          {ready && availableCents > 0 && !hasPending && (
            <form action={requestPayout}>
              <Button type="submit" size="lg">
                Request payout of {formatCurrency(availableCents / 100)}
              </Button>
            </form>
          )}
          {!ready && availableCents > 0 && (
            <Text className="text-sm/6">
              <p>Set up your connected account below to request a payout.</p>
            </Text>
          )}
          <p className="text-xs text-olive-600 dark:text-olive-500">
            Stripe processing and payout fees are your responsibility and may be deducted by Stripe from your transfers
            and bank payouts.
          </p>
        </Card>

        {/* Connected account */}
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Payout account</h3>
            <span className="text-sm font-semibold text-olive-700 dark:text-olive-300">
              {ready ? 'Ready' : hasAccount ? 'Setup incomplete' : 'Not connected'}
            </span>
          </div>

          {ready ? (
            <Text className="text-sm/6">
              <p>
                Connected account <span className="font-mono">{partner?.stripeAccountId}</span> is ready to receive
                payouts.
              </p>
            </Text>
          ) : (
            <>
              <Text className="text-sm/6">
                <p>
                  To receive equity payouts you need a Stripe connected account on our platform. Set one up, or link an
                  account you created previously.
                </p>
              </Text>
              <form action={startConnectOnboarding}>
                <Button type="submit">{hasAccount ? 'Finish Stripe setup' : 'Set up payouts with Stripe'}</Button>
              </form>

              <div className="border-t border-olive-950/10 pt-4 dark:border-white/10">
                <p className="mb-2 text-sm font-medium text-olive-700 dark:text-olive-400">
                  Already have a connected account?
                </p>
                <ManualConnectForm />
              </div>
            </>
          )}
        </Card>

        {/* Payout frequency */}
        <Card className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Payout frequency</h3>
          <Text className="text-sm/6">
            <p>How often Stripe pays your balance out to your bank.</p>
          </Text>
          <form action={savePayoutFrequency} className="flex flex-wrap items-end gap-3">
            <select name="frequency" defaultValue={frequency} className={inputClass}>
              <option value="manual">Manual</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <SoftButton type="submit">Save</SoftButton>
          </form>
        </Card>

        {/* History */}
        <Card className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Payout history</h3>
          {payouts.length === 0 ? (
            <Text className="text-sm/6">
              <p>No payouts yet.</p>
            </Text>
          ) : (
            <div className="flex flex-col divide-y divide-olive-950/10 dark:divide-white/10">
              {payouts.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="text-olive-950 dark:text-white">{formatCurrency(p.amountCents / 100)}</span>
                  <span className="text-olive-600 dark:text-olive-500">{p.requestedAt.toLocaleDateString()}</span>
                  <span className="font-semibold text-olive-700 dark:text-olive-300">{payoutStatusLabel[p.status]}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Container>
    </section>
  )
}
