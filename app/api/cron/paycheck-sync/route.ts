import { listTenantsWithActiveBankLinks } from '@/lib/tenants'
import { syncTenantDeposits } from '@/lib/paychecks'
import { purgeOldStatements } from '@/lib/statements'
import { safeEqual } from '@/lib/crypto'
import { logError } from '@/lib/log'

/**
 * Daily safety net for per-paycheck collection: re-sync every active bank
 * connection in case a Plaid webhook was missed (each sync also collects any
 * queued deposits), and purge bank statements past their retention period.
 * Webhooks remain the primary trigger; this only catches up.
 *
 * Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) return new Response('Cron not configured', { status: 500 })
  if (!safeEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let synced = 0
  let failed = 0
  for (const tenant of await listTenantsWithActiveBankLinks()) {
    try {
      const r = await syncTenantDeposits(tenant.id)
      if (r !== 'skipped' && r !== 'locked') synced++
    } catch (err) {
      failed++
      logError('cron/paycheck-sync', err, { tenantId: tenant.id })
    }
  }

  let purged = 0
  try {
    purged = await purgeOldStatements()
  } catch (err) {
    logError('cron/paycheck-sync/purge', err)
  }
  return Response.json({ synced, failed, purgedStatements: purged })
}
