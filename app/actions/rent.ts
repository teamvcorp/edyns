'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/dal'
import { logError } from '@/lib/log'
import { formatCents } from '@/lib/format'
import {
  getTenantById,
  updateBillingTerms,
  recordRentCredit,
  setNextIncomeCheck,
  restartBilling,
  attachStripeCustomer,
  RENT_CREDIT_METHODS,
  type BillingFrequency,
  type RentCreditMethod,
} from '@/lib/tenants'
import {
  RENT_INTERVALS,
  withProcessingFee,
  adjustRentSubscription,
  addCustomerCredit,
  createRentSubscription,
  subscriptionEnded,
  fetchCustomerForImport,
} from '@/lib/stripe'
import { sendRentChangeEmail, sendRentCreditEmail } from '@/lib/email'

/**
 * Admin rent management for tenants who already have rent collection set up:
 *  - adjustRentAction: change amount / frequency / next draft date (no proration;
 *    new terms start on the chosen date).
 *  - addRentCreditAction: record a payment made outside Stripe (cash, check…) as
 *    a credit on the tenant's Stripe balance, which reduces the next draft(s).
 *    Partner equity still accrues: the webhook credits equity when the rent
 *    invoice is marked paid, even if a credit covered it (see api/stripe/webhook).
 *
 *  - restartRentAction: start a NEW subscription for a tenant whose rent was
 *    canceled (Stripe can't reactivate a canceled subscription).
 *
 * All forms carry a one-time `nonce` used as the Stripe idempotency key, so a
 * double-click or retried submit can't apply a change or credit twice.
 */

export type RentFormState = { error?: string; ok?: string } | undefined

const MAX_RENT_DOLLARS = 20_000
const MAX_NOTE = 500
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000

const frequencyLabel: Record<BillingFrequency, string> = {
  weekly: 'weekly',
  biweekly: 'every 2 weeks',
  monthly: 'monthly',
}

const methodLabel: Record<RentCreditMethod, string> = {
  cash: 'cash',
  check: 'check',
  money_order: 'money order',
  bank_transfer: 'bank transfer',
  other: 'other',
}

function readNonce(formData: FormData): string | null {
  const nonce = String(formData.get('nonce') ?? '')
  return /^[0-9a-f-]{36}$/i.test(nonce) ? nonce : null
}

/** yyyy-mm-dd → Date at local noon (avoids timezone day-slips), or null. */
function readDate(value: FormDataEntryValue | null): Date | null {
  const s = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function revalidateTenant(tenantId: string) {
  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath('/admin/tenants')
  revalidatePath('/admin/revenue')
  revalidatePath('/tenants')
}

export async function adjustRentAction(_prev: RentFormState, formData: FormData): Promise<RentFormState> {
  await requireRole('admin', '/admin/login')

  const tenantId = String(formData.get('tenantId') ?? '')
  const baseDollars = Number(String(formData.get('amount') ?? '').trim())
  const frequency = String(formData.get('frequency') ?? '') as BillingFrequency
  const nextDraftAt = readDate(formData.get('nextDraft'))
  const note = String(formData.get('note') ?? '').trim().slice(0, MAX_NOTE)
  const nonce = readNonce(formData)

  if (!nonce) return { error: 'This form expired — reload the page and try again.' }
  if (!Number.isFinite(baseDollars) || baseDollars <= 0 || baseDollars > MAX_RENT_DOLLARS) {
    return { error: 'Enter the base rent amount in dollars.' }
  }
  if (!RENT_INTERVALS[frequency]) return { error: 'Choose a frequency.' }
  if (!nextDraftAt) return { error: 'Choose the next draft date.' }
  if (nextDraftAt.getTime() <= Date.now()) return { error: 'The next draft date must be in the future.' }
  if (nextDraftAt.getTime() > Date.now() + TWO_YEARS_MS) return { error: 'Choose a date within the next two years.' }

  const tenant = await getTenantById(tenantId)
  if (!tenant?.billing) return { error: 'This tenant has no rent collection to change.' }
  if (tenant.billing.status === 'canceled') return { error: 'Rent collection is canceled — set it up again instead.' }

  const baseAmountCents = Math.round(baseDollars * 100)
  const amountCents = withProcessingFee(baseAmountCents) // tenant covers Stripe's fee (app rule)

  const result = await adjustRentSubscription({
    subscriptionId: tenant.billing.stripeSubscriptionId,
    amountCents,
    frequency,
    nextDraftAt,
    tenantId,
    idempotencyKey: `rent-adjust:${nonce}`,
  })
  if (!result.ok) return { error: result.error }

  // Stripe changed — now mirror it locally. If this write fails, Stripe is still
  // right (it's what charges); log loudly so the record can be fixed.
  const saved = await updateBillingTerms(
    tenantId,
    { baseAmountCents, amountCents, frequency, nextDraftAt },
    {
      at: new Date(),
      from: {
        baseAmountCents: tenant.billing.baseAmountCents,
        amountCents: tenant.billing.amountCents,
        frequency: tenant.billing.frequency,
      },
      to: { baseAmountCents, amountCents, frequency, nextDraftAt },
      note: note || undefined,
    },
  )
  if (!saved) logError('rent/adjust-local-save', new Error('updateBillingTerms matched no tenant'), { tenantId })

  // Keep the monthly income re-check aligned with the new draft schedule.
  await setNextIncomeCheck(tenantId, nextDraftAt)

  let emailNote = ''
  try {
    await sendRentChangeEmail({
      to: tenant.email,
      name: tenant.name,
      amount: formatCents(amountCents),
      frequencyLabel: frequencyLabel[frequency],
      nextDraft: nextDraftAt.toLocaleDateString(),
    })
  } catch (err) {
    logError('rent/adjust-email', err, { tenantId })
    emailNote = ' (the email to the tenant failed — let them know directly)'
  }

  revalidateTenant(tenantId)
  return {
    ok: `Rent updated: ${formatCents(amountCents)} ${frequencyLabel[frequency]}, next draft ${nextDraftAt.toLocaleDateString()}${emailNote}.`,
  }
}

export async function addRentCreditAction(_prev: RentFormState, formData: FormData): Promise<RentFormState> {
  await requireRole('admin', '/admin/login')

  const tenantId = String(formData.get('tenantId') ?? '')
  const dollars = Number(String(formData.get('amount') ?? '').trim())
  const method = String(formData.get('method') ?? '') as RentCreditMethod
  // Single line: shown in Stripe and emails.
  const reference = String(formData.get('reference') ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 100)
  const note = String(formData.get('note') ?? '').trim().slice(0, MAX_NOTE)
  const receivedAt = readDate(formData.get('receivedAt'))
  const nonce = readNonce(formData)

  if (!nonce) return { error: 'This form expired — reload the page and try again.' }
  if (!Number.isFinite(dollars) || dollars <= 0 || dollars > MAX_RENT_DOLLARS) {
    return { error: 'Enter the amount received in dollars.' }
  }
  if (!RENT_CREDIT_METHODS.includes(method)) return { error: 'Choose how the payment was made.' }
  if (!receivedAt) return { error: 'Enter the date the payment was received.' }
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  if (receivedAt > endOfToday) return { error: 'The received date can’t be in the future.' }

  const tenant = await getTenantById(tenantId)
  if (!tenant?.billing || !tenant.stripeCustomerId) {
    return { error: 'This tenant has no Stripe rent collection to credit.' }
  }

  const amountCents = Math.round(dollars * 100)
  const credit = await addCustomerCredit({
    customerId: tenant.stripeCustomerId,
    amountCents,
    description: `Rent credit — ${methodLabel[method]} received ${receivedAt.toISOString().slice(0, 10)}${reference ? ` (ref ${reference})` : ''}`,
    metadata: {
      type: 'rent_credit',
      tenantId,
      method,
      receivedAt: receivedAt.toISOString().slice(0, 10),
    },
    idempotencyKey: `rent-credit:${nonce}`,
  })
  if (!credit.ok) return { error: credit.error }

  const saved = await recordRentCredit(tenantId, {
    stripeTransactionId: credit.transactionId,
    amountCents,
    method,
    reference: reference || undefined,
    note: note || undefined,
    receivedAt,
    recordedAt: new Date(),
  })
  if (!saved) {
    // Already logged (retried submit) or tenant vanished — the Stripe credit is what matters.
    logError('rent/credit-local-save', new Error('recordRentCredit did not write'), {
      tenantId,
      stripeTransactionId: credit.transactionId,
    })
  }

  let emailNote = ''
  try {
    await sendRentCreditEmail({
      to: tenant.email,
      name: tenant.name,
      amount: formatCents(amountCents),
      methodLabel: methodLabel[method],
      receivedOn: receivedAt.toLocaleDateString(),
    })
  } catch (err) {
    logError('rent/credit-email', err, { tenantId })
    emailNote = ' The receipt email failed — let the tenant know directly.'
  }

  revalidateTenant(tenantId)
  return { ok: `Credited ${formatCents(amountCents)} — it will reduce the next draft.${emailNote}` }
}

/**
 * Restart rent for a tenant whose subscription was CANCELED. Stripe can't
 * reactivate a canceled subscription, so this creates a new one (same customer,
 * saved payment method) that first drafts on the chosen date, and archives the
 * old billing record.
 *
 * Safety: refuses unless Stripe confirms the old subscription really ended —
 * otherwise the tenant could be charged by two subscriptions at once.
 */
export async function restartRentAction(_prev: RentFormState, formData: FormData): Promise<RentFormState> {
  await requireRole('admin', '/admin/login')

  const tenantId = String(formData.get('tenantId') ?? '')
  const baseDollars = Number(String(formData.get('amount') ?? '').trim())
  const frequency = String(formData.get('frequency') ?? '') as BillingFrequency
  const firstDraftAt = readDate(formData.get('nextDraft'))
  const nonce = readNonce(formData)

  if (!nonce) return { error: 'This form expired — reload the page and try again.' }
  if (!Number.isFinite(baseDollars) || baseDollars <= 0 || baseDollars > MAX_RENT_DOLLARS) {
    return { error: 'Enter the base rent amount in dollars.' }
  }
  if (!RENT_INTERVALS[frequency]) return { error: 'Choose a frequency.' }
  if (!firstDraftAt) return { error: 'Choose the first draft date.' }
  if (firstDraftAt.getTime() <= Date.now()) return { error: 'The first draft date must be in the future.' }
  if (firstDraftAt.getTime() > Date.now() + TWO_YEARS_MS) return { error: 'Choose a date within the next two years.' }

  const tenant = await getTenantById(tenantId)
  if (!tenant?.billing || tenant.billing.status !== 'canceled') {
    return { error: 'Only canceled rent collection can be restarted.' }
  }
  if (!tenant.stripeCustomerId) return { error: 'This tenant has no Stripe customer on file.' }

  // 1. Never double-bill: the old subscription must be over in Stripe.
  const old = await subscriptionEnded(tenant.billing.stripeSubscriptionId)
  if (old === null) return { error: 'Couldn’t confirm the old subscription with Stripe — try again shortly.' }
  if (!old.ended) {
    return {
      error: `Stripe still shows the old subscription as “${old.status}”. Cancel it in Stripe first (or use “Change amount” if it is actually live), then restart.`,
    }
  }

  // 2. Payment method: the one saved in the app, else the customer's default in
  //    Stripe (imported tenants never had it saved locally).
  let paymentMethodId = tenant.defaultPaymentMethodId
  if (!paymentMethodId) {
    const customer = await fetchCustomerForImport(tenant.stripeCustomerId)
    paymentMethodId = customer.ok ? (customer.data.defaultPaymentMethodId ?? undefined) : undefined
    if (!paymentMethodId) {
      return {
        error:
          'No saved payment method on the Stripe customer. Add one to the customer in the Stripe dashboard, then restart.',
      }
    }
    await attachStripeCustomer(tenant.userId, tenant.stripeCustomerId, paymentMethodId)
  }

  // 3. New subscription.
  const baseAmountCents = Math.round(baseDollars * 100)
  const amountCents = withProcessingFee(baseAmountCents)
  let created: { subscriptionId: string; active: boolean }
  try {
    created = await createRentSubscription({
      customerId: tenant.stripeCustomerId,
      paymentMethodId,
      amountCents,
      frequency,
      firstDraftAt,
      tenantId,
      idempotencyKey: `rent-restart:${nonce}`,
    })
  } catch (err) {
    logError('rent/restart-create', err, { tenantId })
    return { error: 'Stripe could not start the new subscription. Check the payment method and date.' }
  }

  // 4. Swap the billing record (archives the canceled one).
  const saved = await restartBilling(tenantId, {
    amountCents,
    baseAmountCents,
    frequency,
    stripeSubscriptionId: created.subscriptionId,
    status: created.active ? 'active' : 'past_due',
    firstDraftAt,
    nextDraftAt: firstDraftAt,
    startedAt: new Date(),
  })
  if (!saved) {
    // Someone else restarted at the same moment, or the record changed. The new
    // Stripe subscription exists but isn't linked — flag loudly for cleanup.
    logError('rent/restart-local-save', new Error('restartBilling matched no canceled billing'), {
      tenantId,
      subscriptionId: created.subscriptionId,
    })
    return {
      error: `Rent record changed while restarting. New Stripe subscription ${created.subscriptionId} was created but not linked — cancel it in Stripe and reload.`,
    }
  }
  await setNextIncomeCheck(tenantId, firstDraftAt)

  let emailNote = ''
  try {
    await sendRentChangeEmail({
      to: tenant.email,
      name: tenant.name,
      amount: formatCents(amountCents),
      frequencyLabel: frequencyLabel[frequency],
      nextDraft: firstDraftAt.toLocaleDateString(),
    })
  } catch (err) {
    logError('rent/restart-email', err, { tenantId })
    emailNote = ' (the email to the tenant failed — let them know directly)'
  }

  revalidateTenant(tenantId)
  return {
    ok: `Rent restarted: ${formatCents(amountCents)} ${frequencyLabel[frequency]}, first draft ${firstDraftAt.toLocaleDateString()}${emailNote}.`,
  }
}
