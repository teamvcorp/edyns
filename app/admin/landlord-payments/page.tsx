import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { listTenants } from '@/lib/tenants'
import { programOf, PROGRAMS, isUpgradeReady } from '@/lib/programs'
import { balancesForTenants, sumBetween } from '@/lib/program-ledger'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { Link } from '@/components/elements/link'
import { formatCents } from '@/lib/format'

export const metadata: Metadata = { title: 'Landlord payments' }

/** Start of the current and next calendar month (server local time). */
function monthBounds(now: Date): { start: Date; end: Date; label: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { start, end, label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }
}

/**
 * Every "Your Home + Car" tenant whose rent we forward to an outside landlord:
 * what's on hand, what's been paid this month, and who needs a payment sent.
 * Payments are recorded on each tenant's page (Program funds held).
 */
export default async function LandlordPaymentsPage() {
  await requireRole('admin', '/admin/login')

  const tenants = (await listTenants()).filter(
    (t) => t.status === 'approved' && PROGRAMS[programOf(t)].outsideLandlord,
  )
  const { start, end, label } = monthBounds(new Date())
  const [balances, paidThisMonth] = await Promise.all([
    balancesForTenants(tenants.map((t) => t.id)),
    Promise.all(tenants.map((t) => sumBetween(t.id, 'rent', ['landlord_payment'], start, end))),
  ])

  const rows = tenants.map((t, i) => {
    const rentCents = t.landlord?.monthlyRentCents ?? 0
    const paidCents = -paidThisMonth[i] // landlord payments are stored negative
    const heldCents = balances.get(t.id)?.rentHeldCents ?? 0
    const dueCents = Math.max(0, rentCents - paidCents)
    // Reserve = available funds beyond what's still owed this month (lib/programs.ts upgrade rule).
    const upgradeReady = isUpgradeReady(Math.max(0, heldCents - dueCents), rentCents)
    const status =
      dueCents === 0 ? 'Paid' : heldCents >= dueCents ? 'Ready to pay' : `Short ${formatCents(dueCents - heldCents)}`
    return { t, rentCents, paidCents, heldCents, dueCents, status, upgradeReady }
  })
  // Most urgent first: ready to pay, then short, then paid.
  const rank = (s: string) => (s === 'Ready to pay' ? 0 : s === 'Paid' ? 2 : 1)
  rows.sort((a, b) => rank(a.status) - rank(b.status))

  return (
    <PortalShell eyebrow="Administration" title="Landlord payments">
      <Card className="flex flex-col gap-4">
        <Text className="text-sm/6">
          <p>
            Rent we collect for tenants in {PROGRAMS.own_landlord.label} and {PROGRAMS.own_landlord_car.label} is paid to their landlord by staff (bill pay,
            ACH or check). Record each payment on the tenant’s page. Showing {label}.
          </p>
        </Text>
        {rows.length === 0 ? (
          <p className="text-sm text-olive-600 dark:text-olive-500">No approved tenants in this program yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-olive-600 dark:text-olive-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Tenant</th>
                  <th className="py-2 pr-4 font-medium">Landlord</th>
                  <th className="py-2 pr-4 font-medium">Monthly rent</th>
                  <th className="py-2 pr-4 font-medium">Paid this month</th>
                  <th className="py-2 pr-4 font-medium">Available funds</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="text-olive-950 dark:text-white">
                {rows.map(({ t, rentCents, paidCents, heldCents, status, upgradeReady }) => (
                  <tr key={t.id} className="border-t border-olive-950/10 dark:border-white/10">
                    <td className="py-2 pr-4">
                      <Link href={`/admin/tenants/${t.id}`}>{t.name}</Link>
                      {upgradeReady && (
                        <span className="ml-2 rounded-full bg-olive-950/10 px-2 py-0.5 text-xs font-semibold dark:bg-white/10">
                          Upgrade-ready
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{t.landlord?.name ?? '—'}</td>
                    <td className="py-2 pr-4">{formatCents(rentCents)}</td>
                    <td className="py-2 pr-4">{formatCents(paidCents)}</td>
                    <td className="py-2 pr-4">{formatCents(heldCents)}</td>
                    <td
                      className={
                        status === 'Paid'
                          ? 'py-2 text-olive-600 dark:text-olive-400'
                          : status === 'Ready to pay'
                            ? 'py-2 font-medium'
                            : 'py-2 font-medium text-amber-700 dark:text-amber-400'
                      }
                    >
                      {status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PortalShell>
  )
}
