import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listAllPayoutRequests } from '@/lib/payouts'
import { findPartnerById } from '@/lib/users'
import { approvePayoutAction, declinePayoutAction } from '@/app/actions/admin'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { Button, SoftButton } from '@/components/elements/button'
import { formatCurrency } from '@/lib/format'

export const metadata: Metadata = { title: 'Payout requests' }

const inputClass =
  'rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 dark:bg-white/5 dark:text-white dark:ring-white/10'

const statusLabel = { requested: 'Pending', paid: 'Paid', declined: 'Declined' } as const

const banner: Record<string, { text: string; tone: 'ok' | 'warn' }> = {
  paid: { text: 'Payout transferred to the partner’s connected account.', tone: 'ok' },
  'transfer-failed': { text: 'The transfer failed (platform balance, or account not ready).', tone: 'warn' },
  'no-account': { text: 'That partner has no connected account.', tone: 'warn' },
  'not-ready': { text: 'That partner’s connected account isn’t ready for payouts.', tone: 'warn' },
}

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; error?: string }>
}) {
  await requireRole('admin', '/admin/login')
  const sp = await searchParams
  const requests = await listAllPayoutRequests()

  const rows = await Promise.all(
    requests.map(async (r) => ({ request: r, partner: await findPartnerById(r.partnerId) })),
  )
  const pending = rows.filter((r) => r.request.status === 'requested')
  const decided = rows.filter((r) => r.request.status !== 'requested')

  const bannerKey = sp.error ?? (sp.paid ? 'paid' : undefined)
  const bannerInfo = bannerKey ? banner[bannerKey] : undefined

  return (
    <PortalShell
      eyebrow="Administration"
      title={`Payout requests (${requests.length})`}
      breadcrumbs={[{ label: 'Admin dashboard', href: '/admin' }, { label: 'Payout requests' }]}
    >
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

      <div className="flex flex-col gap-6">
        <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Pending ({pending.length})</h3>
        {pending.length === 0 ? (
          <Card>
            <Text className="text-sm/6">
              <p>No payout requests awaiting approval.</p>
            </Text>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map(({ request, partner }) => (
              <Card key={request.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div className="flex flex-col">
                  <span className="font-medium text-olive-950 dark:text-white">
                    {formatCurrency(request.amountCents / 100)} · {partner?.name ?? 'Partner'}
                  </span>
                  <span className="text-sm text-olive-600 dark:text-olive-500">
                    {partner?.email} · requested {request.requestedAt.toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <form action={approvePayoutAction}>
                    <input type="hidden" name="id" value={request.id} />
                    <Button type="submit">Approve & send</Button>
                  </form>
                  <form action={declinePayoutAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={request.id} />
                    <input name="note" placeholder="Reason" className={inputClass} />
                    <SoftButton type="submit" className="text-red-600 dark:text-red-400">
                      Decline
                    </SoftButton>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <div className="flex flex-col gap-6">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">History ({decided.length})</h3>
          <div className="flex flex-col gap-3">
            {decided.map(({ request, partner }) => (
              <Card key={request.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="flex flex-col">
                  <span className="text-olive-950 dark:text-white">
                    {formatCurrency(request.amountCents / 100)} · {partner?.name ?? 'Partner'}
                  </span>
                  {request.status === 'declined' && request.note && (
                    <span className="text-sm text-red-600 dark:text-red-400">{request.note}</span>
                  )}
                </div>
                <span className="text-sm font-semibold text-olive-700 dark:text-olive-300">
                  {statusLabel[request.status]}
                </span>
              </Card>
            ))}
          </div>
        </div>
      )}
    </PortalShell>
  )
}
