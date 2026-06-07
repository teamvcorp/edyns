import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getStripe } from '@/lib/stripe'
import { setIdentitySession } from '@/lib/tenants'

const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/** Start a Stripe Identity (document + selfie) session for the signed-in tenant. */
export async function POST(): Promise<NextResponse> {
  const session = await getSession()
  if (session?.role !== 'tenant') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Stripe error' }, { status: 502 })
  }
}
