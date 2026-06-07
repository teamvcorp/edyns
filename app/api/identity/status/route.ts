import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getStripe } from '@/lib/stripe'
import { getTenantByUserId, markIdentityVerified } from '@/lib/tenants'

/** Called when the tenant returns from Stripe Identity — gives instant feedback. */
export async function GET(): Promise<NextResponse> {
  const session = await getSession()
  if (session?.role !== 'tenant') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await getTenantByUserId(session.sub)
  if (tenant?.identityVerified) return NextResponse.json({ status: 'verified', identityVerified: true })
  if (!tenant?.stripeIdentitySessionId) return NextResponse.json({ status: 'none', identityVerified: false })

  try {
    const vs = await getStripe().identity.verificationSessions.retrieve(tenant.stripeIdentitySessionId, {
      expand: ['verified_outputs'],
    })
    if (vs.status === 'verified') {
      const outputs = vs.verified_outputs as { id_number?: string | null } | null
      const last4 = outputs?.id_number ? outputs.id_number.replace(/\D/g, '').slice(-4) : undefined
      await markIdentityVerified({ userId: session.sub, last4 })
      return NextResponse.json({ status: 'verified', identityVerified: true })
    }
    return NextResponse.json({ status: vs.status, identityVerified: false })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Stripe error' }, { status: 502 })
  }
}
