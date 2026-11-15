import { NextResponse } from 'next/server'
import { sessionWithRole } from '@/lib/dal'
import { getTenantByUserId } from '@/lib/tenants'
import { createBankLinkToken } from '@/lib/plaid'
import { decryptString } from '@/lib/crypto'
import { paycheckCollectionEnabled } from '@/lib/paychecks'
import { rateLimit, getClientIp } from '@/lib/ratelimit'
import { logError, logWarn } from '@/lib/log'

/**
 * Plaid Link token for the PAYCHECK bank connection (Transactions + Statements
 * consent) — separate from income verification (/api/tenants/plaid/link-token).
 *
 * Body `{ mode }`:
 *  - 'link' (default): connect a bank account (approved tenants only).
 *  - 'relink': Plaid update mode for a broken connection (ITEM_LOGIN_REQUIRED…).
 *  - 'statements': update mode adding Statements consent for an income review.
 * Access tokens never leave the server; only the short-lived link token does.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const session = await sessionWithRole('tenant')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!paycheckCollectionEnabled()) return NextResponse.json({ error: 'Not available yet.' }, { status: 404 })

  const body = await req.json().catch(() => {
    logWarn('plaid/bank-link-token', 'malformed JSON body')
    return null
  })
  const mode = body?.mode === 'relink' || body?.mode === 'statements' ? body.mode : 'link'

  const ip = await getClientIp()
  const byUser = await rateLimit({ key: `plaid-bank:user:${session.sub}`, limit: 10, windowMs: 60 * 60 * 1000 })
  const byIp = await rateLimit({ key: `plaid-bank:ip:${ip}`, limit: 20, windowMs: 60 * 60 * 1000 })
  if (!byUser.allowed || !byIp.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  const tenant = await getTenantByUserId(session.sub)
  if (!tenant || tenant.status !== 'approved') {
    return NextResponse.json({ error: 'Bank linking opens after your application is approved.' }, { status: 400 })
  }

  try {
    if (mode === 'link') {
      return NextResponse.json({ link_token: await createBankLinkToken(session.sub) })
    }
    if (!tenant.bankLink?.accessTokenEnc) {
      return NextResponse.json({ error: 'Connect your bank first.' }, { status: 400 })
    }
    const accessToken = decryptString(tenant.bankLink.accessTokenEnc)
    const linkToken = await createBankLinkToken(session.sub, { accessToken, statementsOnly: mode === 'statements' })
    return NextResponse.json({ link_token: linkToken })
  } catch (err) {
    logError('plaid/bank-link-token', err, { tenantId: tenant.id })
    return NextResponse.json({ error: 'Bank connection is temporarily unavailable. Please try again later.' }, { status: 503 })
  }
}
