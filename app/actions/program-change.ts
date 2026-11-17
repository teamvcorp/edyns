'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/dal'
import {
  getTenantByUserId,
  getTenantById,
  createProgramChangeRequest,
  decideProgramChange,
  setTenantProgram,
  updateBillingTerms,
} from '@/lib/tenants'
import { PROGRAMS, programOf, isProgramId, splitForIncome } from '@/lib/programs'
import { parseLandlordFields, readLandlordValues } from '@/lib/tenant-input'
import { saveLeaseFile, promotePendingLease, discardPendingLease } from '@/lib/leases'
import { getActiveCar } from '@/lib/car-assignments'
import { adjustRentSubscription, getRentSubscriptionState, withProcessingFee } from '@/lib/stripe'
import { sendStaffNotice, sendProgramChangeDecisionEmail } from '@/lib/email'
import { formatCents } from '@/lib/format'
import { logError } from '@/lib/log'

/**
 * Program changes: the TENANT requests, an ADMIN approves (decided 2026-11-17).
 * Approval switches the program and — for tenants on fixed drafts — re-prices
 * the Stripe subscription to the new program's rates from the next draft date,
 * using the same split/fee rules as every other rent change. Paycheck-mode
 * tenants need nothing else: each collection reads the current program's rates.
 */

export type ProgramChangeState = { error?: string; ok?: string; errors?: Record<string, string> } | undefined

function revalidate(tenantId: string) {
  revalidatePath('/tenants')
  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath('/admin/tenants')
}

// ---- Tenant -------------------------------------------------------------------------

export async function requestProgramChangeAction(_prev: ProgramChangeState, fd: FormData): Promise<ProgramChangeState> {
  const session = await requireRole('tenant', '/tenants/login')
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant || tenant.status !== 'approved') return { error: 'Program changes are available once you’re approved.' }
  if (tenant.programChange?.status === 'pending') return { error: 'You already have a request waiting for review.' }

  const to = String(fd.get('program') ?? '')
  const from = programOf(tenant)
  if (!isProgramId(to)) return { error: 'Choose a program.' }
  if (to === from) return { error: 'You’re already in that program.' }
  const note = String(fd.get('note') ?? '').trim().slice(0, 500)

  // Outside-landlord programs need the landlord, rent and a lease (same rules as enrollment).
  let landlord
  let lease
  if (PROGRAMS[to].outsideLandlord) {
    const parsed = await parseLandlordFields(fd, readLandlordValues(fd))
    if (Object.keys(parsed.errors).length > 0) return { errors: parsed.errors, error: 'Please fix the highlighted fields.' }
    landlord = parsed.landlord
    lease = parsed.lease
  }

  try {
    if (lease) await saveLeaseFile(tenant.id, lease, 'pending')
    const saved = await createProgramChangeRequest(tenant.id, {
      from,
      to,
      landlord,
      hasPendingLease: Boolean(lease),
      note: note || undefined,
      status: 'pending',
      requestedAt: new Date(),
    })
    if (!saved) return { error: 'You already have a request waiting for review.' }
  } catch (err) {
    logError('program-change/request', err, { tenantId: tenant.id })
    return { error: 'We couldn’t save your request. Please try again.' }
  }

  try {
    await sendStaffNotice({
      subject: 'Program change requested',
      body: `${tenant.name} asked to move from ${PROGRAMS[from].label} to ${PROGRAMS[to].label}.`,
      link: `/admin/tenants/${tenant.id}#program-change`,
    })
  } catch (err) {
    logError('program-change/staff-notice', err, { tenantId: tenant.id })
  }
  revalidate(tenant.id)
  return { ok: 'Request sent. Our team will review it and email you.' }
}

/** Tenant withdraws their own pending request. */
export async function withdrawProgramChangeAction(): Promise<void> {
  const session = await requireRole('tenant', '/tenants/login')
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant || tenant.programChange?.status !== 'pending') return
  await discardPendingLease(tenant.id)
  await decideProgramChange(tenant.id, 'declined', 'Withdrawn by tenant')
  revalidate(tenant.id)
}

// ---- Admin --------------------------------------------------------------------------

export async function approveProgramChangeAction(_prev: ProgramChangeState, fd: FormData): Promise<ProgramChangeState> {
  await requireRole('admin', '/admin/login')
  const tenantId = String(fd.get('tenantId') ?? '')
  const tenant = await getTenantById(tenantId)
  const req = tenant?.programChange
  if (!tenant || req?.status !== 'pending') return { error: 'No pending request.' }
  const to = req.to
  const def = PROGRAMS[to]

  // A company-owned car must be returned before leaving the car program.
  if (def.carRate === 0 && (await getActiveCar(tenant.id))) {
    return { error: 'This tenant still has an assigned car. Mark it returned before moving them to a program without a car.' }
  }
  if (def.outsideLandlord && !req.landlord) return { error: 'The request is missing landlord details.' }

  // 1) Switch the program (+ landlord/lease for outside-landlord programs).
  const lease = def.outsideLandlord && req.hasPendingLease ? await promotePendingLease(tenant.id) : null
  await setTenantProgram(tenant.id, to, req.landlord, lease ?? undefined)

  // 2) Fixed-draft tenants: re-price the subscription at the new program's rates.
  let pricingNote = ''
  const billing = tenant.billing
  if (billing && billing.status !== 'canceled' && !billing.imported) {
    const income = tenant.employment.verifiedMonthlyIncome
    const live = await getRentSubscriptionState(billing.stripeSubscriptionId)
    const nextDraftAt = live?.nextDraftAt && live.nextDraftAt.getTime() > Date.now() ? live.nextDraftAt : null
    if (!income || !nextDraftAt) {
      pricingNote = ' Update the draft amount on the tenant page — income or next draft date was unavailable.'
    } else {
      const split = splitForIncome(to, income, billing.frequency)
      const rentCents = Math.round(split.rent * 100)
      const carCents = Math.round(split.car * 100)
      const baseAmountCents = rentCents + carCents
      const amountCents = withProcessingFee(baseAmountCents)
      const splitField = def.carRate > 0 ? { rentCents, carCents } : undefined
      const res = await adjustRentSubscription({
        subscriptionId: billing.stripeSubscriptionId,
        amountCents,
        frequency: billing.frequency,
        nextDraftAt,
        tenantId: tenant.id,
        idempotencyKey: `program-change:${tenant.id}:${new Date(req.requestedAt).getTime()}`,
        program: to,
        split: splitField,
      })
      if (res.ok) {
        await updateBillingTerms(
          tenant.id,
          { baseAmountCents, amountCents, frequency: billing.frequency, nextDraftAt, split: splitField },
          {
            at: new Date(),
            from: { baseAmountCents: billing.baseAmountCents, amountCents: billing.amountCents, frequency: billing.frequency },
            to: { baseAmountCents, amountCents, frequency: billing.frequency, nextDraftAt },
            note: `Program change: ${PROGRAMS[req.from].label} → ${def.label}`,
          },
        )
        pricingNote = ` Drafts change to ${formatCents(amountCents)} from ${nextDraftAt.toLocaleDateString()}.`
      } else {
        logError('program-change/reprice', new Error(res.error), { tenantId: tenant.id })
        pricingNote = ` Couldn’t re-price in Stripe (${res.error}) — update the amount on the tenant page.`
      }
    }
  }

  await decideProgramChange(tenant.id, 'approved')
  try {
    await sendProgramChangeDecisionEmail({
      to: tenant.email,
      name: tenant.name,
      approved: true,
      programLabel: def.label,
      detail: pricingNote.includes('Drafts change') ? pricingNote.trim() : undefined,
    })
  } catch (err) {
    logError('program-change/email', err, { tenantId: tenant.id })
  }
  revalidate(tenant.id)
  return { ok: `Moved to ${def.label}.${pricingNote}` }
}

export async function declineProgramChangeAction(_prev: ProgramChangeState, fd: FormData): Promise<ProgramChangeState> {
  await requireRole('admin', '/admin/login')
  const tenantId = String(fd.get('tenantId') ?? '')
  const reason = String(fd.get('reason') ?? '').trim().slice(0, 500)
  const tenant = await getTenantById(tenantId)
  if (!tenant || tenant.programChange?.status !== 'pending') return { error: 'No pending request.' }
  await discardPendingLease(tenant.id)
  await decideProgramChange(tenant.id, 'declined', reason || undefined)
  try {
    await sendProgramChangeDecisionEmail({
      to: tenant.email,
      name: tenant.name,
      approved: false,
      programLabel: PROGRAMS[tenant.programChange.to].label,
      detail: reason || undefined,
    })
  } catch (err) {
    logError('program-change/email', err, { tenantId: tenant.id })
  }
  revalidate(tenant.id)
  return { ok: 'Request declined.' }
}
