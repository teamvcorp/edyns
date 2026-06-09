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

  try {
    let userToken = tenant.plaidUserToken
    if (!userToken) {
      userToken = await createUserToken(session.sub)
      await setPlaidUserToken(session.sub, userToken)
    }
    const linkToken = await createIncomeLinkToken(userToken, session.sub)
    return NextResponse.json({ link_token: linkToken })
  } catch {
    return NextResponse.json({ error: 'Could not start verification' }, { status: 500 })
  }
}
