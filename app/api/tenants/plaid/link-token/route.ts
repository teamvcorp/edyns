import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getTenantByUserId, setPlaidUserToken } from '@/lib/tenants'
import { createUserToken, createIncomeLinkToken } from '@/lib/plaid'
import { rateLimit, getClientIp } from '@/lib/ratelimit'

/** Issues a Plaid Link token for the signed-in tenant's income verification. */
export async function POST(): Promise<NextResponse> {
  const session = await getSession()
  if (session?.role !== 'tenant') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Throttle link-token issuance per tenant and per IP to curb link abuse / Plaid spend.
  const ip = await getClientIp()
  const byUser = await rateLimit({ key: `plaid-link:user:${session.sub}`, limit: 10, windowMs: 60 * 60 * 1000 })
  const byIp = await rateLimit({ key: `plaid-link:ip:${ip}`, limit: 20, windowMs: 60 * 60 * 1000 })
  if (!byUser.allowed || !byIp.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  const tenant = await getTenantByUserId(session.sub)
  if (!tenant) return NextResponse.json({ error: 'No application found' }, { status: 400 })

  const unavailable =
    'Bank income verification is temporarily unavailable. Please upload your most recent paystub instead — our team will verify it.'

  try {
    let userToken = tenant.plaidUserToken
    if (!userToken) {
      const created = await createUserToken(session.sub)
      // The Plaid account must issue a user_token for income; if it doesn't
      // (provisioning not complete), degrade gracefully to the paystub fallback
      // instead of a hard 500 — and don't persist an empty token.
      if (!created.userToken) {
        return NextResponse.json({ error: unavailable, fallback: 'paystub' }, { status: 503 })
      }
      userToken = created.userToken
      await setPlaidUserToken(session.sub, created.userToken, created.userId)
    }
    const linkToken = await createIncomeLinkToken(userToken, session.sub, Boolean(tenant.employment.selfEmployed))
    return NextResponse.json({ link_token: linkToken })
  } catch {
    return NextResponse.json({ error: unavailable, fallback: 'paystub' }, { status: 503 })
  }
}
