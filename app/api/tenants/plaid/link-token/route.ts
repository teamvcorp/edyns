import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getTenantByUserId, setPlaidUserToken } from '@/lib/tenants'
import { createUserToken, createIncomeLinkToken } from '@/lib/plaid'

/** Issues a Plaid Link token for the signed-in tenant's income verification. */
export async function POST(): Promise<NextResponse> {
  const session = await getSession()
  if (session?.role !== 'tenant') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
