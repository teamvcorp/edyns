import { verifyPlaidWebhook } from '@/lib/plaid'
import { readIncome } from '@/lib/income'
import { getTenantByPlaidItem, getTenantByPlaidUserId, setVerifiedIncome } from '@/lib/tenants'

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
    const complete =
      event.verification_status === 'VERIFICATION_STATUS_PROCESSING_COMPLETE' ||
      (event.webhook_code ?? '').includes('COMPLETE')
    if (complete) {
      // Item-based events carry item_id; user-token events (bank-income refresh) carry user_id.
      const tenant = event.item_id
        ? await getTenantByPlaidItem(event.item_id)
        : event.user_id
          ? await getTenantByPlaidUserId(event.user_id)
          : null
      if (tenant?.plaidUserToken) {
        const reading = await readIncome({
          userToken: tenant.plaidUserToken,
          selfEmployed: Boolean(tenant.employment.selfEmployed),
          claimedHourlyRate: tenant.employment.claimedHourlyRate,
        })
        await setVerifiedIncome(tenant.id, {
          monthlyIncome: reading.monthlyIncome,
          weeklyHours: reading.weeklyHours,
          lastPayDate: reading.lastPayDate,
        })
      }
    }
  }

  // Always 200 after a verified event so Plaid doesn't retry indefinitely.
  return new Response('ok', { status: 200 })
}
