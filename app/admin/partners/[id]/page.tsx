import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import { findPartnerById } from '@/lib/users'
import { listPropertiesByPartner } from '@/lib/properties'
import { totalEquityCentsByPartner } from '@/lib/equity'
import { totalPaidCentsByPartner, pendingCentsByPartner } from '@/lib/payouts'
import { deletePartnerAction, resendWelcomeEmailAction, forcePayoutAction } from '@/app/actions/admin'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Link } from '@/components/elements/link'
import { Breadcrumbs } from '@/components/elements/breadcrumbs'
import { Button, SoftButton } from '@/components/elements/button'
import { PartnerEditForm } from '@/components/admin/partner-edit-form'
import { StatusBadge } from '@/components/partners/status-badge'
import { formatAddress, formatCurrency } from '@/lib/format'

export const metadata: Metadata = { title: 'Manage partner' }

const welcomeCopy: Record<string, string> = {
  sent: 'Welcome email sent with a new temporary password.',
  failed: 'Password was reset, but the email failed to send — resend or share access another way.',
  notfound: 'Could not find that user account.',
}

const payoutCopy: Record<string, { text: string; tone: 'ok' | 'warn' }> = {
  paid: { text: 'Payout sent to the partner’s connected account.', tone: 'ok' },
  nothing: { text: 'No available balance to pay out.', tone: 'warn' },
  'no-account': { text: 'Partner has no connected Stripe account for payouts.', tone: 'warn' },
  'transfer-failed': { text: 'Stripe transfer failed — the account may not be payout-enabled.', tone: 'warn' },
}

export default async function AdminPartnerEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; welcome?: string; payout?: string }>
}) {
  await requireRole('admin', '/admin/login')
  const { id } = await params
  const { error, welcome, payout } = await searchParams

  const partner = await findPartnerById(id)
  if (!partner) notFound()

  const properties = await listPropertiesByPartner(id)
  const hasProperties = properties.length > 0

  const [totalEquityCents, paidCents, pendingCents] = await Promise.all([
    totalEquityCentsByPartner(id),
    totalPaidCentsByPartner(id),
    pendingCentsByPartner(id),
  ])
  const availableCents = Math.max(0, totalEquityCents - paidCents - pendingCents)
  const payoutInfo = payout ? payoutCopy[payout] : undefined

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Breadcrumbs
            className="mb-2"
            items={[
              { label: 'Admin dashboard', href: '/admin' },
              { label: 'Partners', href: '/admin/partners' },
              { label: partner.name },
            ]}
          />
          <Eyebrow>Administration</Eyebrow>
          <Subheading className="text-3xl/9 sm:text-4xl/12">Manage partner</Subheading>
        </div>

        {welcome && welcomeCopy[welcome] && (
          <p
            role="status"
            className={
              welcome === 'sent'
                ? 'text-sm text-olive-700 dark:text-olive-300'
                : 'text-sm text-red-600 dark:text-red-400'
            }
          >
            {welcomeCopy[welcome]}
          </p>
        )}

        <Card className="p-8 sm:p-10">
          <PartnerEditForm partner={partner} />
        </Card>

        <Card className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Account access</h3>
          <p className="text-sm text-olive-600 dark:text-olive-500">
            Email this partner a new temporary password and sign-in link. They’ll be prompted to set their own password.
            Useful for anyone who missed setup or lost access.
          </p>
          <form action={resendWelcomeEmailAction}>
            <input type="hidden" name="userId" value={partner.id} />
            <input type="hidden" name="returnTo" value={`/admin/partners/${partner.id}`} />
            <SoftButton type="submit" className="w-fit">
              Resend welcome email
            </SoftButton>
          </form>
        </Card>

        <Card className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Payouts</h3>
          {payoutInfo && (
            <p
              role="status"
              className={
                payoutInfo.tone === 'ok'
                  ? 'text-sm text-olive-700 dark:text-olive-300'
                  : 'text-sm text-red-600 dark:text-red-400'
              }
            >
              {payoutInfo.text}
            </p>
          )}
          <dl className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col">
              <dt className="text-sm text-olive-600 dark:text-olive-500">Total equity</dt>
              <dd className="text-olive-950 dark:text-white">{formatCurrency(totalEquityCents / 100)}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-sm text-olive-600 dark:text-olive-500">Paid + pending</dt>
              <dd className="text-olive-950 dark:text-white">{formatCurrency((paidCents + pendingCents) / 100)}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-sm text-olive-600 dark:text-olive-500">Available</dt>
              <dd className="text-olive-950 dark:text-white">{formatCurrency(availableCents / 100)}</dd>
            </div>
          </dl>
          <p className="text-sm text-olive-600 dark:text-olive-500">
            Force a payout of the partner’s full available balance to their connected account. Available resets to zero;
            lifetime equity is unchanged.
          </p>
          <form action={forcePayoutAction}>
            <input type="hidden" name="partnerId" value={partner.id} />
            <Button type="submit" disabled={availableCents <= 0} className="w-fit disabled:opacity-60">
              Force payout
            </Button>
          </form>
        </Card>

        {/* Their properties */}
        <Card className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">
            Properties ({properties.length})
          </h3>
          {properties.length === 0 ? (
            <Text className="text-sm/6">
              <p>This partner has no properties.</p>
            </Text>
          ) : (
            <div className="flex flex-col divide-y divide-olive-950/10 dark:divide-white/10">
              {properties.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex flex-col">
                    <span className="text-sm text-olive-950 dark:text-white">{formatAddress(p.address)}</span>
                    <span className="text-xs text-olive-600 dark:text-olive-500">
                      Asking {formatCurrency(p.askingPrice)} · Equity {formatCurrency(p.equityGenerated)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatusBadge status={p.status} />
                    <Link href={`/admin/properties/${p.id}`}>Edit</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Danger zone */}
        <Card className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Delete partner</h3>
          {hasProperties ? (
            <Text className="text-sm/6">
              <p>
                This partner still has {properties.length} propert{properties.length === 1 ? 'y' : 'ies'}. Remove or
                reassign their properties before deleting the account.
              </p>
            </Text>
          ) : (
            <Text className="text-sm/6">
              <p>Permanently delete this partner account. This cannot be undone.</p>
            </Text>
          )}
          {error === 'has-properties' && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Can’t delete — this partner still has properties.
            </p>
          )}
          <form action={deletePartnerAction}>
            <input type="hidden" name="id" value={partner.id} />
            <SoftButton
              type="submit"
              disabled={hasProperties}
              className="text-red-600 disabled:opacity-50 dark:text-red-400"
            >
              Delete partner
            </SoftButton>
          </form>
        </Card>
      </Container>
    </section>
  )
}
