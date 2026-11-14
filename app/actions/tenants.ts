'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Stripe from 'stripe'
import { createSession } from '@/lib/session'
import { requireRole } from '@/lib/dal'
import { createUser, isEmailTaken } from '@/lib/users'
import {
  createTenantApplication,
  getTenantByUserId,
  attachStripeCustomer,
  setFeeSession,
  setEmploymentType,
  recordLeaseUpload,
  setShortfallSession,
} from '@/lib/tenants'
import { programOf } from '@/lib/programs'
import { computeShortfall } from '@/lib/shortfall'
import { withProcessingFee } from '@/lib/fees'
import { parseTenantForm } from '@/lib/tenant-input'
import { saveLeaseFile } from '@/lib/leases'
import { getStripe, applicationTotalCents } from '@/lib/stripe'
import { rateLimit, getClientIp } from '@/lib/ratelimit'
import { getValidInviteByToken, claimInvite, releaseInvite, linkInviteToTenant } from '@/lib/invites'
import { getPropertyById } from '@/lib/properties'
import { logError } from '@/lib/log'

export type TenantEnrollState =
  | { errors?: Record<string, string>; values?: Record<string, string>; message?: string }
  | undefined

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

// Account-creation throttle: cap new applications per IP in a rolling window.
const SIGNUP_LIMIT = 5
const SIGNUP_WINDOW_MS = 60 * 60 * 1000

async function startFeeCheckout(opts: { userId: string; email: string; customerId: string }): Promise<string> {
  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: opts.customerId,
    payment_method_types: ['us_bank_account', 'card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: applicationTotalCents(),
          product_data: { name: 'edynsgate application fee', description: '$25 application fee + processing' },
        },
      },
    ],
    payment_intent_data: {
      setup_future_usage: 'off_session', // save the method for future rent payments
      metadata: { userId: opts.userId },
    },
    metadata: { userId: opts.userId },
    success_url: `${baseUrl}/tenants/enroll/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/tenants/enroll?canceled=1`,
  })
  await setFeeSession(opts.userId, session.id)
  return session.url as string
}

export async function enrollTenant(_prev: TenantEnrollState, formData: FormData): Promise<TenantEnrollState> {
  const ip = await getClientIp()
  const { allowed } = await rateLimit({ key: `signup:tenant:${ip}`, limit: SIGNUP_LIMIT, windowMs: SIGNUP_WINDOW_MS })
  if (!allowed) {
    return { message: 'Too many applications from this network. Please try again later.' }
  }

  // Invited applicants: the server-side invite record is authoritative for name,
  // email and the property hint. The browser only carries the opaque token, so
  // none of these can be altered by editing the form or URL. Invites are for
  // homes we manage, so they always enroll in the Effort Exchange.
  const inviteToken = String(formData.get('inviteToken') ?? '')
  const invite = inviteToken ? await getValidInviteByToken(inviteToken) : null

  const parsed = await parseTenantForm(formData, {
    mode: 'self',
    overrides: invite ? { name: invite.name, email: invite.email, program: 'effort_exchange' } : undefined,
  })
  const { values } = parsed

  if (inviteToken && !invite) {
    return {
      message: 'This invitation link has expired or was already used. Ask us for a new invite, or apply from the public form.',
      values,
    }
  }
  if (!parsed.input) return { errors: parsed.errors, values }

  if (await isEmailTaken(values.email, 'tenant')) {
    return { errors: { email: 'A tenant account with this email already exists. Please sign in.' }, values }
  }

  // Single-use: claim the invite atomically BEFORE creating anything, so two
  // concurrent submissions can't both redeem it. Released again on failure.
  if (invite && !(await claimInvite(invite.id))) {
    return { message: 'This invitation link was already used. Please sign in, or ask us for a new invite.', values }
  }

  // Only keep the property hint if it still exists and is approved.
  let interestedPropertyId: string | undefined
  if (invite?.propertyId) {
    const p = await getPropertyById(invite.propertyId)
    if (p && p.status === 'approved') interestedPropertyId = p.id
  }

  let checkoutUrl: string
  let applicationCreated = false
  try {
    const user = await createUser({ email: values.email, name: values.name, password: parsed.password, role: 'tenant' })

    const tenant = await createTenantApplication(user.id, {
      ...parsed.input,
      feeAmountCents: applicationTotalCents(),
      interestedPropertyId,
    })
    applicationCreated = true
    if (invite) await linkInviteToTenant(invite.id, tenant.id)

    // Own-landlord applicants: store the (already byte-validated) lease, encrypted.
    // Non-fatal: the account already exists, so failing here would strand the
    // applicant. Staff see "no lease on file" in admin and can follow up.
    if (parsed.lease) {
      try {
        const { uploadedAt } = await saveLeaseFile(tenant.id, parsed.lease)
        await recordLeaseUpload(tenant.id, { uploadedAt, contentType: parsed.lease.contentType })
      } catch (err) {
        logError('tenants/enroll/lease', err, { tenantId: tenant.id })
      }
    }

    // Sign them in now so they can resume payment / see pending status even if they bail on Checkout.
    await createSession({ sub: user.id, role: 'tenant', name: user.name })

    const stripe = getStripe()
    const customer = await stripe.customers.create({
      email: values.email,
      name: values.name,
      phone: values.phone,
      metadata: { userId: user.id },
    })
    await attachStripeCustomer(user.id, customer.id)

    checkoutUrl = await startFeeCheckout({ userId: user.id, email: values.email, customerId: customer.id })
  } catch (e) {
    logError('tenants/enroll', e)
    // Failed before the application existed → let them retry with the same
    // link. Once the application exists the invite stays consumed (they can
    // sign in and resume payment from the portal).
    if (invite && !applicationCreated) await releaseInvite(invite.id)
    if (e instanceof Stripe.errors.StripeError) {
      return { message: 'Payment setup failed. Please try again.', values }
    }
    return { message: 'Something went wrong creating your application. Please try again.', values }
  }

  redirect(checkoutUrl) // external redirect to Stripe Checkout — keep outside try/catch
}

/** Re-start the application-fee checkout for a signed-in tenant who hasn't paid. */
export async function resumeApplicationPayment(): Promise<void> {
  const session = await requireRole('tenant', '/tenants/login')
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant || tenant.fee.status === 'paid') redirect('/tenants')

  const stripe = getStripe()
  let customerId = tenant!.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: tenant!.email,
      name: tenant!.name,
      metadata: { userId: session.sub },
    })
    customerId = customer.id
    await attachStripeCustomer(session.sub, customerId)
  }

  const url = await startFeeCheckout({ userId: session.sub, email: tenant!.email, customerId })
  redirect(url)
}

/**
 * Own-landlord tenant pays this month's rent shortfall once via Stripe Checkout.
 *
 * Security: the amount is NEVER taken from the request — it's the smaller of
 * the server-saved notice and a fresh recomputation (a deposit or landlord
 * payment since the email may have shrunk it). The session carries
 * `metadata.type: 'rent_shortfall'` so the webhook routes it to the program
 * ledger (without a type it would be misread as an application fee).
 */
export async function payShortfallAction(): Promise<void> {
  const session = await requireRole('tenant', '/tenants/login')
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant || programOf(tenant) !== 'own_landlord') redirect('/tenants')
  const notice = tenant!.shortfall
  if (!notice || notice.paidAt) redirect('/tenants')
  if (!tenant!.stripeCustomerId) redirect('/tenants?shortfall=error')

  const current = await computeShortfall(tenant!, new Date())
  const amountCents = Math.min(notice!.amountCents, current?.shortfallCents ?? 0)
  if (amountCents <= 0) redirect('/tenants?shortfall=covered')

  let url: string
  try {
    const metadata = {
      type: 'rent_shortfall',
      tenantId: tenant!.id,
      month: notice!.month,
      baseCents: String(amountCents),
    }
    const checkout = await getStripe().checkout.sessions.create(
      {
        mode: 'payment',
        customer: tenant!.stripeCustomerId,
        payment_method_types: ['us_bank_account', 'card'],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: withProcessingFee(amountCents), // tenant covers processing (app rule)
              product_data: {
                name: `Rent balance for ${notice!.month}`,
                description: 'Difference between your monthly rent and what was collected, plus processing',
              },
            },
          },
        ],
        payment_intent_data: { metadata },
        metadata,
        success_url: `${baseUrl}/tenants?shortfall=paid`,
        cancel_url: `${baseUrl}/tenants?shortfall=canceled#shortfall`,
      },
      // Same tenant/month/amount within 24h → Stripe replays the same session (no duplicates).
      { idempotencyKey: `shortfall:${tenant!.id}:${notice!.month}:${amountCents}` },
    )
    await setShortfallSession(tenant!.id, notice!.month, checkout.id)
    url = checkout.url as string
  } catch (err) {
    logError('tenants/shortfall-checkout', err, { tenantId: tenant!.id })
    redirect('/tenants?shortfall=error')
  }
  redirect(url) // external redirect to Stripe Checkout — outside try/catch
}

// Tenants verify income through Plaid only — there is no tenant paystub upload.
// Admins can attach a paystub as a last resort (uploadPaystubAction in admin.ts).

/**
 * Set whether the tenant is self-employed (verifies via bank deposits, hours
 * implied from a claimed hourly rate) vs. employed (payroll). Admin can override.
 */
export async function setSelfEmployment(
  selfEmployed: boolean,
  hourlyRate: number | null,
): Promise<{ error?: string } | void> {
  const session = await requireRole('tenant', '/tenants/login')
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant) return { error: 'No application on file.' }
  if (selfEmployed && !(hourlyRate != null && hourlyRate > 0)) {
    return { error: 'Enter your hourly rate so we can confirm your weekly hours.' }
  }
  await setEmploymentType(session.sub, {
    selfEmployed,
    claimedHourlyRate: selfEmployed ? hourlyRate ?? undefined : undefined,
  })
  revalidatePath('/tenants')
}
