import { verifyPlaidWebhook } from '@/lib/plaid'
import { readIncome } from '@/lib/income'
import {
  getTenantByPlaidItem,
  getTenantByPlaidUserId,
  setVerifiedIncome,
  flagTenantForReview,
  type Tenant,
} from '@/lib/tenants'
import { sendSecurityAlert } from '@/lib/email'

/** Flag a tenant for manual review and alert ops (best-effort). */
async function flagAndAlert(tenant: Tenant, reason: string): Promise<void> {
  await flagTenantForReview(tenant.userId, reason)
  try {
    await sendSecurityAlert({
      subject: 'Tenant income verification needs review',
      body: `${reason} — ${tenant.name} (${tenant.email}). Income could not be confirmed automatically; follow up (bank-deposit fallback or paystub).`,
    })
  } catch {
    /* alert is best-effort */
  }
}

/**
 * Plaid webhook receiver. Verifies the `Plaid-Verification` JWT against the raw
 * body before acting. On income verification completion we refresh the tenant's
 * verified income (the synchronous link flow already does this; the webhook
 * covers the async Document/Payroll paths).
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text()
  const verification = request.headers.get('plaid-verification')

  const valid = await verifyPlaidWebhook(rawBody, verification)
  if (!valid) return new Response('Invalid signature', { status: 400 })

  let event: {
    webhook_type?: string
    webhook_code?: string
    verification_status?: string
    item_id?: string
    user_id?: string
  }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response('Bad payload', { status: 400 })
  }

  if (event.webhook_type === 'INCOME') {
    const status = event.verification_status ?? ''
    const code = event.webhook_code ?? ''
    const complete = status === 'VERIFICATION_STATUS_PROCESSING_COMPLETE' || code.includes('COMPLETE')
    // Plaid signals a dead end with a FAILED/INSUFFICIENT/EXPIRED status (or code).
    const failed = !complete && (/FAILED|INSUFFICIENT|EXPIRED/.test(status) || /FAILED|ERROR/.test(code))

    if (complete || failed) {
      // Item-based events carry item_id; user-token events (bank-income refresh) carry user_id.
      const tenant = event.item_id
        ? await getTenantByPlaidItem(event.item_id)
        : event.user_id
          ? await getTenantByPlaidUserId(event.user_id)
          : null

      if (tenant) {
        if (complete && tenant.plaidUserToken) {
          const reading = await readIncome({
            userToken: tenant.plaidUserToken,
            selfEmployed: Boolean(tenant.employment.selfEmployed),
            claimedHourlyRate: tenant.employment.claimedHourlyRate,
          })
          if (reading.monthlyIncome != null) {
            await setVerifiedIncome(tenant.id, {
              monthlyIncome: reading.monthlyIncome,
              weeklyHours: reading.weeklyHours,
              lastPayDate: reading.lastPayDate,
            })
          } else {
            // Verification finished but Plaid surfaced no income — don't mark verified.
            await flagAndAlert(tenant, 'Income verification completed but no income was found')
          }
        } else if (failed) {
          await flagAndAlert(tenant, `Income verification did not complete (${status || code})`)
        }
      }
    }
  }

  // Always 200 after a verified event so Plaid doesn't retry indefinitely.
  return new Response('ok', { status: 200 })
}
