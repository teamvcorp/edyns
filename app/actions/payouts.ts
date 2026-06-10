'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/dal'
import { getStripe } from '@/lib/stripe'
import {
  findPartnerById,
  setStripeAccountId,
  setPayoutFrequency,
  type PayoutFrequency,
} from '@/lib/users'
import { totalEquityCentsByPartner } from '@/lib/equity'
import { totalPaidCentsByPartner, pendingCentsByPartner, hasPendingRequest, createPayoutRequest } from '@/lib/payouts'

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
const FREQUENCIES: PayoutFrequency[] = ['manual', 'daily', 'weekly', 'monthly']

/** Create/reuse the partner's Express connected account and send them to Stripe onboarding. */
export async function startConnectOnboarding(): Promise<void> {
  const session = await requireRole('partner', '/partners/login')
  const partner = await findPartnerById(session.sub)
  if (!partner) redirect('/partners/login')

  const stripe = getStripe()
  let accountId = partner!.stripeAccountId
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: partner!.email,
      capabilities: { transfers: { requested: true } },
      metadata: { userId: session.sub },
    })
    accountId = account.id
    await setStripeAccountId(session.sub, accountId)
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/partners/payouts?refresh=1`,
    return_url: `${baseUrl}/partners/payouts?return=1`,
    type: 'account_onboarding',
  })
  redirect(link.url)
}

export type ManualConnectState = { error?: string; ok?: boolean } | undefined

/** Attach an existing connected account (created before this app) by its acct_ id. */
export async function saveManualConnectAccount(
  _prev: ManualConnectState,
  formData: FormData,
): Promise<ManualConnectState> {
  const session = await requireRole('partner', '/partners/login')
  const accountId = String(formData.get('accountId') ?? '').trim()

  if (!/^acct_[A-Za-z0-9]+$/.test(accountId)) {
    return { error: 'Enter a valid Stripe account id (starts with “acct_”).' }
  }

  try {
    await getStripe().accounts.retrieve(accountId)
  } catch {
    return { error: 'That account could not be found on our Stripe platform.' }
  }

  await setStripeAccountId(session.sub, accountId)
  revalidatePath('/partners/payouts')
  return { ok: true }
}

export async function savePayoutFrequency(formData: FormData): Promise<void> {
  const session = await requireRole('partner', '/partners/login')
  const value = String(formData.get('frequency') ?? '') as PayoutFrequency
  if (!FREQUENCIES.includes(value)) redirect('/partners/payouts')

  await setPayoutFrequency(session.sub, value)

  // Best-effort: push the schedule to the connected account (may be controlled by
  // the Express account itself, in which case Stripe rejects it — that's fine).
  const partner = await findPartnerById(session.sub)
  if (partner?.stripeAccountId) {
    try {
      await getStripe().accounts.update(partner.stripeAccountId, {
        settings: { payouts: { schedule: { interval: value } } },
      })
    } catch {
      /* schedule controlled by the connected account; preference still saved on our side */
    }
  }

  revalidatePath('/partners/payouts')
  redirect('/partners/payouts?freq=1')
}

/**
 * Partner requests a payout of their available equity. This does NOT move money —
 * an admin reviews and approves it (so refunds/clawbacks can be caught first).
 */
export async function requestPayout(): Promise<void> {
  const session = await requireRole('partner', '/partners/login')
  const partner = await findPartnerById(session.sub)
  if (!partner?.stripeAccountId) redirect('/partners/payouts?error=not-ready')

  const account = await getStripe().accounts.retrieve(partner!.stripeAccountId!)
  if (!account.payouts_enabled) redirect('/partners/payouts?error=not-ready')

  if (await hasPendingRequest(session.sub)) redirect('/partners/payouts')

  const totalEquityCents = await totalEquityCentsByPartner(session.sub)
  const paidCents = await totalPaidCentsByPartner(session.sub)
  const pending = await pendingCentsByPartner(session.sub)
  const availableCents = totalEquityCents - paidCents - pending
  if (availableCents <= 0) redirect('/partners/payouts')

  await createPayoutRequest(session.sub, availableCents)
  revalidatePath('/partners/payouts')
  redirect('/partners/payouts?requested=1')
}
