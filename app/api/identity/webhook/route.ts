import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { markIdentityVerified } from '@/lib/tenants'

/**
 * Stripe Identity webhook — the source of truth (covers tenants who close the tab
 * before redirecting back). Uses its own signing secret, falling back to the
 * payments webhook secret if a dedicated one isn't set.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const sig = req.headers.get('stripe-signature')
  const secret = process.env.STRIPE_IDENTITY_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET
  if (!sig || !secret) return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 })

  const raw = await req.text() // raw bytes required for signature verification
  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'identity.verification_session.verified') {
    const vs = event.data.object as Stripe.Identity.VerificationSession
    try {
      let last4: string | undefined
      try {
        const full = await getStripe().identity.verificationSessions.retrieve(vs.id, {
          expand: ['verified_outputs'],
        })
        const outputs = full.verified_outputs as { id_number?: string | null } | null
        if (outputs?.id_number) last4 = outputs.id_number.replace(/\D/g, '').slice(-4)
      } catch {
        /* last 4 is optional */
      }
      await markIdentityVerified({ userId: vs.metadata?.userId, sessionId: vs.id, last4 })
    } catch (err) {
      console.error('Identity webhook error:', err)
      // Return 200 anyway so Stripe doesn't retry forever; status check is the fallback.
    }
  }

  return NextResponse.json({ received: true })
}
