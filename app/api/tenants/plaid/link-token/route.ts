import { NextResponse } from 'next/server'
import { sessionWithRole } from '@/lib/dal'
import { getTenantByUserId, setPlaidUserToken } from '@/lib/tenants'
import { createUserToken, createIncomeLinkToken } from '@/lib/plaid'
import { rateLimit, getClientIp } from '@/lib/ratelimit'
import { logError, logWarn } from '@/lib/log'

/** Issues a Plaid Link token for the signed-in tenant's income verification.
 *  Body may request `{ source: 'bank' }` so an employee whose payroll provider
 *  isn't supported by Plaid can fall back to verifying via bank deposits. */
export async function POST(req: Request): Promise<NextResponse> {
  const session = await sessionWithRole('tenant')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // No body is normal (default payroll path). Only a body that claims to be JSON
  // but doesn't parse is worth noting.
  const body = await req.json().catch(() => {
    if (req.headers.get('content-type')?.includes('application/json')) {
      logWarn('plaid/link-token', 'malformed JSON request body')
    }
    return null
  })
  const requestedBank = body?.source === 'bank'

  // Throttle link-token issuance per tenant and per IP to curb link abuse / Plaid spend.
  const ip = await getClientIp()
  const byUser = await rateLimit({ key: `plaid-link:user:${session.sub}`, limit: 10, windowMs: 60 * 60 * 1000 })
  const byIp = await rateLimit({ key: `plaid-link:ip:${ip}`, limit: 20, windowMs: 60 * 60 * 1000 })
  if (!byUser.allowed || !byIp.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  const tenant = await getTenantByUserId(session.sub)
  if (!tenant) return NextResponse.json({ error: 'No application found' }, { status: 400 })

  // Plaid is the only self-service income path (no tenant paystub uploads), so
  // when it's down we ask the tenant to retry or contact us — never to upload.
  const unavailable =
    'Bank income verification is temporarily unavailable. Please try again later, or reply to your approval email and our team will help.'

  try {
    let userToken = tenant.plaidUserToken
    if (!userToken) {
      const created = await createUserToken(session.sub)
      // The Plaid account must issue a user_token for income; if it doesn't
      // (provisioning not complete), return a friendly 503 instead of a hard
      // 500 — and don't persist an empty token.
      if (!created.userToken) {
        return NextResponse.json({ error: unavailable }, { status: 503 })
      }
      userToken = created.userToken
      await setPlaidUserToken(session.sub, created.userToken, created.userId)
    }
    // Self-employed always verify via bank; employees use payroll unless they
    // explicitly fall back to bank deposits.
    const source = tenant.employment.selfEmployed || requestedBank ? 'bank' : 'payroll'
    const linkToken = await createIncomeLinkToken(userToken, session.sub, source)
    return NextResponse.json({ link_token: linkToken })
  } catch (err) {
    logError('plaid/link-token', err)
    return NextResponse.json({ error: unavailable }, { status: 503 })
  }
}
