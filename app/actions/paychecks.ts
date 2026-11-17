'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { requireRole } from '@/lib/dal'
import {
  getTenantByUserId,
  getTenantById,
  setBankLink,
  setBankLinkStatus,
  recordPaycheckAuthorization,
  startPaycheckMode,
  pausePaycheckMode,
  setBillingStatusBySubscription,
  clearPaycheckAuthorization,
  removeBankLink,
  setStatementsState,
} from '@/lib/tenants'
import { exchangePublicToken, getItemAccount, removePlaidItem } from '@/lib/plaid'
import { encryptString, decryptString } from '@/lib/crypto'
import { getStripe, getBankAccountLast4 } from '@/lib/stripe'
import { redirect } from 'next/navigation'
import {
  paycheckCollectionEnabled,
  syncTenantDeposits,
  includeDeposit,
  ignoreDeposit,
  getDepositTenantId,
  buildAuthorizationText,
  defaultRangeMaxCents,
  AUTHORIZATION_VERSION,
  accountMismatchAllowedForTesting,
} from '@/lib/paychecks'
import { logError } from '@/lib/log'

/**
 * Per-paycheck collection actions (lib/paychecks.ts; plan in
 * docs/plans/paycheck-collection.md). Tenant actions act ONLY on the signed-in
 * tenant's own record; admin actions require the admin role. Every action is a
 * public POST endpoint, so each one re-checks the feature flag and permissions.
 */

export type PaycheckActionResult = { error?: string; ok?: string } | undefined

/** Pause reason used when the tenant switches paycheck accounts; re-authorizing resumes ONLY this pause. */
const ACCOUNT_CHANGED_REASON = 'Paycheck account changed — waiting for the tenant to re-authorize'
const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

function revalidateTenant(tenantId: string) {
  revalidatePath('/tenants')
  revalidatePath(`/admin/tenants/${tenantId}`)
}

// ---- Tenant -------------------------------------------------------------------------

/**
 * Finish Plaid Link for the paycheck account. The tenant chose ONE account in
 * Link; we confirm it's a checking/savings account on that Item, store the
 * access token encrypted, and run the first sync (stores history only — deposits
 * before paycheck mode starts are never collected).
 */
export async function completeBankLink(publicToken: string, accountId: string): Promise<PaycheckActionResult> {
  const session = await requireRole('tenant', '/tenants/login')
  if (!paycheckCollectionEnabled()) return { error: 'Not available yet.' }
  if (typeof publicToken !== 'string' || typeof accountId !== 'string' || !publicToken || !accountId) {
    return { error: 'Bank connection was incomplete. Please try again.' }
  }
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant || tenant.status !== 'approved') return { error: 'Bank linking opens after approval.' }

  try {
    const { accessToken, itemId } = await exchangePublicToken(publicToken)
    const account = await getItemAccount(accessToken, accountId)
    if (!account || account.type !== 'depository') {
      await removePlaidItem(accessToken).catch((err) => logError('paychecks/link-cleanup', err))
      return { error: 'Please choose the checking or savings account your paycheck goes into.' }
    }
    // Switching accounts: the old authorization named the old account, so it no
    // longer applies — clear it and pause collection until they re-authorize.
    if (tenant.bankLink) {
      await clearPaycheckAuthorization(tenant.id)
      if (tenant.paycheck?.status === 'active') await pausePaycheckMode(tenant.id, ACCOUNT_CHANGED_REASON)
    }
    // Replacing an older connection: remove that Plaid Item so it stops billing.
    if (tenant.bankLink?.accessTokenEnc && tenant.bankLink.itemId !== itemId) {
      await removePlaidItem(decryptString(tenant.bankLink.accessTokenEnc)).catch((err) =>
        logError('paychecks/remove-old-item', err, { tenantId: tenant.id }),
      )
    }
    await setBankLink(tenant.id, {
      itemId,
      accessTokenEnc: encryptString(accessToken),
      accountId,
      mask: account.mask,
      institution: account.name,
      status: 'active',
      linkedAt: new Date(),
    })
  } catch (err) {
    logError('paychecks/complete-link', err, { tenantId: tenant.id })
    return { error: 'We couldn’t connect your bank. Please try again.' }
  }

  // First sync activates Plaid's webhooks for the Item (best-effort; the cron retries).
  try {
    await syncTenantDeposits(tenant.id)
  } catch (err) {
    logError('paychecks/initial-sync', err, { tenantId: tenant.id })
  }
  revalidateTenant(tenant.id)
  return { ok: 'Bank connected.' }
}

/**
 * Update mode finished. 'relink' = the tenant signed in again → mark healthy and
 * sync. 'statements' = they approved sharing statements → record consent and
 * fetch the statements right away for the admin's income review.
 */
export async function completeBankRelink(mode: 'relink' | 'statements' = 'relink'): Promise<PaycheckActionResult> {
  const session = await requireRole('tenant', '/tenants/login')
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant?.bankLink) return { error: 'No bank connection on file.' }
  if (mode === 'statements') {
    await setStatementsState(tenant.id, { ...tenant.bankLink.statements, consentedAt: new Date() })
    try {
      const { fetchStatementsForTenant } = await import('@/lib/statements')
      await fetchStatementsForTenant(tenant.id)
    } catch (err) {
      logError('paychecks/statements-after-consent', err, { tenantId: tenant.id })
    }
    revalidateTenant(tenant.id)
    return { ok: 'Thanks — your statements were shared with our team.' }
  }
  await setBankLinkStatus(tenant.id, 'active')
  try {
    await syncTenantDeposits(tenant.id)
  } catch (err) {
    logError('paychecks/relink-sync', err, { tenantId: tenant.id })
  }
  revalidateTenant(tenant.id)
  return { ok: 'Bank reconnected.' }
}

/**
 * Tenant accepts the per-paycheck debit authorization. Stored verbatim with time,
 * IP and user agent (proof of authorization). Requires the Stripe bank account
 * to be the SAME account as the Plaid-linked one. New tenants with no active
 * fixed schedule start paycheck mode right away (the default mode).
 */
export async function acceptPaycheckAuthorization(): Promise<PaycheckActionResult> {
  const session = await requireRole('tenant', '/tenants/login')
  if (!paycheckCollectionEnabled()) return { error: 'Not available yet.' }
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant || tenant.status !== 'approved') return { error: 'Available after approval.' }
  if (tenant.bankLink?.status !== 'active') return { error: 'Connect your bank first.' }
  if (!tenant.defaultPaymentMethodId) return { error: 'No saved bank account for payments yet.' }

  const bank = await getBankAccountLast4(tenant.defaultPaymentMethodId)
  if (!bank) return { error: 'Your saved payment method must be a bank account. Contact us to update it.' }
  if (tenant.bankLink.mask && bank.last4 !== tenant.bankLink.mask && !accountMismatchAllowedForTesting()) {
    return {
      error: `Your payment account ends in ${bank.last4}, but the connected bank account ends in ${tenant.bankLink.mask}. They must be the same account — contact us to update it.`,
    }
  }

  const rangeMaxCents = defaultRangeMaxCents(tenant)
  if (rangeMaxCents <= 0) return { error: 'We need your verified income first.' }
  const h = await headers()
  await recordPaycheckAuthorization(tenant.id, {
    acceptedAt: new Date(),
    textVersion: AUTHORIZATION_VERSION,
    text: buildAuthorizationText(tenant, tenant.bankLink.mask, rangeMaxCents),
    rangeMaxCents,
    accountMask: tenant.bankLink.mask,
    ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || undefined,
    userAgent: h.get('user-agent')?.slice(0, 300) ?? undefined,
  })

  const onSchedule = tenant.billing && tenant.billing.status !== 'canceled'
  if (tenant.paycheck) {
    // Re-authorizing after switching accounts resumes collection; an admin pause stays paused.
    if (tenant.paycheck.status === 'paused' && tenant.paycheck.pausedReason === ACCOUNT_CHANGED_REASON) {
      await startPaycheckMode(tenant.id, { keepCollectFrom: true })
    }
  } else if (!onSchedule) {
    await startPaycheckMode(tenant.id)
  }
  revalidateTenant(tenant.id)
  return {
    ok: onSchedule
      ? 'Thanks — authorization saved. Our team will switch you from fixed drafts to paycheck collection.'
      : 'Thanks — paycheck collection is on. You’ll get a receipt for every collection.',
  }
}

// ---- Admin --------------------------------------------------------------------------

/**
 * Move a tenant from fixed drafts to paycheck collection. Cancels the Stripe
 * subscription FIRST so they can never be charged by both.
 */
export async function switchToPaycheckModeAction(_prev: PaycheckActionResult, fd: FormData): Promise<PaycheckActionResult> {
  await requireRole('admin', '/admin/login')
  if (!paycheckCollectionEnabled()) return { error: 'Paycheck collection is disabled.' }
  const tenant = await getTenantById(String(fd.get('tenantId') ?? ''))
  if (!tenant) return { error: 'Tenant not found.' }
  if (!tenant.paycheckAuthorization) return { error: 'The tenant must accept the paycheck authorization first.' }
  if (tenant.bankLink?.status !== 'active') return { error: 'The tenant’s bank connection isn’t active.' }

  if (tenant.billing && tenant.billing.status !== 'canceled') {
    try {
      await getStripe().subscriptions.cancel(tenant.billing.stripeSubscriptionId)
      await setBillingStatusBySubscription(tenant.billing.stripeSubscriptionId, 'canceled')
    } catch (err) {
      logError('paychecks/cancel-subscription', err, { tenantId: tenant.id })
      return { error: 'Couldn’t cancel the fixed-draft subscription in Stripe — nothing was changed.' }
    }
  }
  await startPaycheckMode(tenant.id, { keepCollectFrom: Boolean(tenant.paycheck) })
  revalidateTenant(tenant.id)
  return { ok: 'Switched to paycheck collection. Paychecks from now on will be collected.' }
}

export async function pausePaycheckAction(_prev: PaycheckActionResult, fd: FormData): Promise<PaycheckActionResult> {
  await requireRole('admin', '/admin/login')
  const tenantId = String(fd.get('tenantId') ?? '')
  const reason = String(fd.get('reason') ?? '').trim().slice(0, 300) || 'Paused by admin'
  await pausePaycheckMode(tenantId, reason)
  revalidateTenant(tenantId)
  return { ok: 'Paycheck collection paused.' }
}

export async function resumePaycheckAction(_prev: PaycheckActionResult, fd: FormData): Promise<PaycheckActionResult> {
  await requireRole('admin', '/admin/login')
  if (!paycheckCollectionEnabled()) return { error: 'Paycheck collection is disabled.' }
  const tenantId = String(fd.get('tenantId') ?? '')
  const tenant = await getTenantById(tenantId)
  if (!tenant?.paycheck) return { error: 'Paycheck mode was never started for this tenant.' }
  // Keep the original start date: deposits that arrived while paused land in review, not auto-collect.
  await startPaycheckMode(tenantId, { keepCollectFrom: true })
  revalidateTenant(tenantId)
  return { ok: 'Paycheck collection resumed.' }
}

export async function syncNowAction(_prev: PaycheckActionResult, fd: FormData): Promise<PaycheckActionResult> {
  await requireRole('admin', '/admin/login')
  const tenantId = String(fd.get('tenantId') ?? '')
  try {
    const r = await syncTenantDeposits(tenantId)
    revalidateTenant(tenantId)
    if (r === 'skipped') return { error: 'No active bank connection.' }
    if (r === 'locked') return { ok: 'A sync is already running.' }
    return { ok: `Synced: ${r.added} new deposit(s), ${r.queued} queued for collection.` }
  } catch (err) {
    logError('paychecks/sync-now', err, { tenantId })
    return { error: 'Sync failed — see logs.' }
  }
}

/** Include (or retry) a deposit → collect now. Ignore → never collected. */
export async function decideDepositAction(fd: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const depositId = String(fd.get('depositId') ?? '')
  const decision = String(fd.get('decision') ?? '')
  const tenantId = await getDepositTenantId(depositId)
  if (!tenantId) return
  if (decision === 'include') await includeDeposit(depositId)
  else if (decision === 'ignore') await ignoreDeposit(depositId)
  revalidateTenant(tenantId)
}

// ---- Admin: bank statements (income fallback, Phase 7 / 7b) -----------------------------

/** Fetch the tenant's latest bank statements from Plaid (consent collected at bank link). */
export async function fetchStatementsAction(_prev: PaycheckActionResult, fd: FormData): Promise<PaycheckActionResult> {
  await requireRole('admin', '/admin/login')
  const tenantId = String(fd.get('tenantId') ?? '')
  const { fetchStatementsForTenant } = await import('@/lib/statements')
  const state = await fetchStatementsForTenant(tenantId)
  revalidateTenant(tenantId)
  switch (state) {
    case 'fetched':
      return { ok: 'Statements fetched.' }
    case 'needs_consent':
      return { ok: 'The tenant must approve sharing statements — they’ll see a prompt in their portal.' }
    case 'unsupported':
      return { error: 'Their bank doesn’t support statements. Use the paystub upload instead.' }
    case 'no_link':
      return { error: 'The tenant hasn’t connected a bank yet.' }
    default:
      return { error: 'Couldn’t fetch statements — see logs.' }
  }
}

/** Run the AI reader over stored statements (extracts lines; totals computed in code). */
export async function analyzeStatementsAction(_prev: PaycheckActionResult, fd: FormData): Promise<PaycheckActionResult> {
  await requireRole('admin', '/admin/login')
  const tenantId = String(fd.get('tenantId') ?? '')
  const force = fd.get('force') === 'on'
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'AI reading isn’t configured (ANTHROPIC_API_KEY).' }
  const { analyzeTenantStatements } = await import('@/lib/statement-reader')
  try {
    const { read, failed } = await analyzeTenantStatements(tenantId, { force })
    revalidateTenant(tenantId)
    if (read === 0 && failed === 0) return { ok: 'Nothing new to read.' }
    return failed
      ? { error: `Read ${read} statement(s); ${failed} couldn’t be read — review those manually.` }
      : { ok: `Read ${read} statement(s). Review the totals below.` }
  } catch (err) {
    logError('paychecks/analyze-statements', err, { tenantId })
    return { error: 'AI reading failed — review manually.' }
  }
}

// ---- Tenant: bank management (decided 2026-11-17) ------------------------------------

/**
 * Disconnect the paycheck bank. Allowed only while paycheck collection isn't
 * active — an active program needs an active payment source (switch accounts
 * instead). Removes the Plaid Item so it stops billing.
 */
export async function disconnectBankAction(): Promise<PaycheckActionResult> {
  const session = await requireRole('tenant', '/tenants/login')
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant?.bankLink) return { error: 'No bank connected.' }
  if (tenant.paycheck?.status === 'active') {
    return { error: 'Paycheck collection is active, so a bank account is required. Use “Switch account” instead.' }
  }
  try {
    await removePlaidItem(decryptString(tenant.bankLink.accessTokenEnc))
  } catch (err) {
    logError('paychecks/disconnect-item', err, { tenantId: tenant.id }) // still remove our record
  }
  await removeBankLink(tenant.id)
  revalidateTenant(tenant.id)
  return { ok: 'Bank disconnected.' }
}

/**
 * Save a new bank account for payments (Stripe Checkout in SETUP mode — no
 * charge). Needed when the paycheck account changes, because the debited
 * account must be the same account. Instant verification only, so the account
 * is usable immediately. The webhook (metadata.type 'payment_method_update')
 * makes it the default and moves any live subscription onto it.
 */
export async function updatePaymentAccountAction(): Promise<void> {
  const session = await requireRole('tenant', '/tenants/login')
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant?.stripeCustomerId) redirect('/tenants?payment=error')
  let url: string | null = null
  try {
    const checkout = await getStripe().checkout.sessions.create({
      mode: 'setup',
      customer: tenant!.stripeCustomerId,
      payment_method_types: ['us_bank_account'],
      payment_method_options: { us_bank_account: { verification_method: 'instant' } },
      metadata: { type: 'payment_method_update', tenantId: tenant!.id },
      setup_intent_data: { metadata: { type: 'payment_method_update', tenantId: tenant!.id } },
      success_url: `${baseUrl}/tenants?payment=updated#payment-account`,
      cancel_url: `${baseUrl}/tenants?payment=canceled#payment-account`,
    })
    url = checkout.url
  } catch (err) {
    logError('paychecks/payment-update-checkout', err, { tenantId: tenant!.id })
  }
  redirect(url ?? '/tenants?payment=error') // external redirect — outside try/catch
}
