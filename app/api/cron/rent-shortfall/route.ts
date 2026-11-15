import { listTenantsForShortfallCheck, setShortfallNotice } from '@/lib/tenants'
import { computeShortfall, monthKey } from '@/lib/shortfall'
import { affordableRentFor } from '@/lib/programs'
import { sendRentShortfallEmail } from '@/lib/email'
import { formatCents, formatCurrency } from '@/lib/format'
import { safeEqual } from '@/lib/crypto'
import { logError } from '@/lib/log'

/**
 * Monthly rent-shortfall check for outside-landlord tenants ("Your Home" / "Your Home + Car").
 * Scheduled near month end (vercel.json). For each tenant whose collected rent
 * won't cover this month's landlord rent, save a one-per-month notice and email
 * them the balance with an offer to pay the difference once (Checkout from the
 * portal) — and a nudge toward housing they can afford.
 *
 * Safe to re-run: setShortfallNotice is atomic per month, so a tenant is never
 * emailed twice for the same month.
 *
 * Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) return new Response('Cron not configured', { status: 500 })
  // Constant-time compare so the secret can't be guessed byte-by-byte via timing.
  if (!safeEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const now = new Date()
  const { key: month, label: monthLabel } = monthKey(now)
  const tenants = await listTenantsForShortfallCheck()
  let checked = 0
  let notified = 0
  let failed = 0

  for (const tenant of tenants) {
    checked++
    try {
      const result = await computeShortfall(tenant, now)
      if (!result || result.shortfallCents <= 0) continue

      // Claim this month's notice first; false = already notified this month.
      if (!(await setShortfallNotice(tenant.id, month, result.shortfallCents))) continue

      const income = tenant.employment.verifiedMonthlyIncome ?? tenant.employment.monthlyIncome
      await sendRentShortfallEmail({
        to: tenant.email,
        name: tenant.name,
        monthLabel,
        landlordName: tenant.landlord?.name ?? 'your landlord',
        rent: formatCents(result.rentCents),
        onHand: formatCents(result.onHandCents),
        shortfall: formatCents(result.shortfallCents),
        affordableRent: formatCurrency(affordableRentFor(income)),
      })
      notified++
    } catch (err) {
      failed++
      logError('cron/rent-shortfall', err, { tenantId: tenant.id })
    }
  }

  return Response.json({ month, checked, notified, failed })
}
