import { NextResponse } from 'next/server'
import { sessionWithRole } from '@/lib/dal'
import { getStripe } from '@/lib/stripe'
import { setIdentitySession } from '@/lib/tenants'
import { logError } from '@/lib/log'

const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/** Start a Stripe Identity (document + selfie) session for the signed-in tenant. */
export async function POST(): Promise<NextResponse> {
  const session = await sessionWithRole('tenant')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const vs = await getStripe().identity.verificationSessions.create({
      type: 'document',
      metadata: { userId: session.sub }, // links the webhook back to this tenant
      options: { document: { require_matching_selfie: true } },
      return_url: `${baseUrl}/tenants?identity=done`,
    })
    await setIdentitySession(session.sub, vs.id)
    return NextResponse.json({ url: vs.url })
  } catch (err) {
    // Log the real cause server-side; never echo provider errors to the browser.
    logError('identity/start', err)
    return NextResponse.json({ error: 'Could not start verification. Please try again.' }, { status: 502 })
  }
}
