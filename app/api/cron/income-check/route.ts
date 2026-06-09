import {
  listTenantsDueForIncomeCheck,
  setVerifiedIncome,
  setNextIncomeCheck,
  pauseBillingForReview,
} from '@/lib/tenants'
import { readIncome } from '@/lib/income'
import { getStripe } from '@/lib/stripe'
import { sendSecurityAlert } from '@/lib/email'

/**
 * Monthly income / job-loss check. Runs daily (Vercel Cron) and processes
 * tenants whose active rent is due for a re-check on/after their pay date. If
 * recent income is found, refresh the figures and reschedule a month out. If
 * not (possible job loss), pause the Stripe subscription, flag for review, and
 * alert ops — an admin must reconfirm to resume.
 *
 * Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) return new Response('Cron not configured', { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const now = new Date()
  const due = await listTenantsDueForIncomeCheck(now)
  let checked = 0
  let paused = 0

  for (const tenant of due) {
    if (!tenant.plaidUserToken || !tenant.billing) continue
    checked++

    let hasRecentIncome = false
    let reading: Awaited<ReturnType<typeof readIncome>> | null = null
    try {
      reading = await readIncome({
        userToken: tenant.plaidUserToken,
        selfEmployed: Boolean(tenant.employment.selfEmployed),
        claimedHourlyRate: tenant.employment.claimedHourlyRate,
      })
      hasRecentIncome = reading.hasRecentIncome
    } catch {
      // Couldn't reach Plaid / item needs re-auth → treat as needs-review.
      hasRecentIncome = false
    }

    if (hasRecentIncome && reading) {
      await setVerifiedIncome(tenant.id, {
        monthlyIncome: reading.monthlyIncome,
        weeklyHours: reading.weeklyHours,
        lastPayDate: reading.lastPayDate,
      })
      const next = new Date(now)
      next.setMonth(next.getMonth() + 1)
      await setNextIncomeCheck(tenant.id, next)
    } else {
      try {
        await getStripe().subscriptions.update(tenant.billing.stripeSubscriptionId, {
          pause_collection: { behavior: 'void' },
        })
      } catch {
        /* still flag below even if the pause call fails */
      }
      await pauseBillingForReview(tenant.id, 'Monthly income check found no recent income — possible job loss.')
      try {
        await sendSecurityAlert({
          subject: 'Tenant rent paused — no recent income',
          body: `Rent paused for ${tenant.name} (${tenant.email}). The monthly income check found no recent income (possible job loss or a bank connection needing re-auth). Reconfirm before resuming.`,
        })
      } catch {
        /* best-effort */
      }
      paused++
    }
  }

  return Response.json({ ok: true, checked, paused })
}
