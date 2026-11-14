'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import { getTenantById, getTenantByUserId } from '@/lib/tenants'
import { PROGRAMS, programOf } from '@/lib/programs'
import { balancesFor, recordLedgerEntry, hasLedgerRef } from '@/lib/program-ledger'
import { createCarOffer, getCarOffer, getOpenCarOffer, transitionCarOffer } from '@/lib/car-offers'
import { sendCarOfferEmail } from '@/lib/email'
import { formatCents } from '@/lib/format'
import { logError } from '@/lib/log'

/**
 * Car offers (lib/car-offers.ts). Admins create / withdraw offers and mark the
 * purchase; tenants accept or decline their own offer. Every check that
 * matters (savings cover the price, offer state, ownership) is re-done here on
 * the server — the forms are never trusted.
 */

export type CarOfferFormState = { error?: string; ok?: string } | undefined

const MAX_VEHICLE = 200
const MAX_NOTES = 500

function revalidateCar(tenantId: string) {
  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath('/tenants')
}

// ---- Admin ----

export async function createCarOfferAction(_prev: CarOfferFormState, fd: FormData): Promise<CarOfferFormState> {
  await requireRole('admin', '/admin/login')

  const tenantId = String(fd.get('tenantId') ?? '')
  const vehicle = String(fd.get('vehicle') ?? '').trim().slice(0, MAX_VEHICLE)
  const notes = String(fd.get('notes') ?? '').trim().slice(0, MAX_NOTES)
  const price = Number(String(fd.get('price') ?? '').trim())

  if (vehicle.length < 3) return { error: 'Describe the vehicle (year, make, model, mileage).' }
  if (!Number.isFinite(price) || price <= 0 || price > 200_000) return { error: 'Enter the vehicle price in dollars.' }
  const priceCents = Math.round(price * 100)

  const tenant = await getTenantById(tenantId)
  if (!tenant) return { error: 'Tenant not found.' }
  if (PROGRAMS[programOf(tenant)].carRate === 0) return { error: 'This tenant isn’t in a car savings program.' }

  // The offer must fit the money actually saved.
  const { carSavingsCents } = await balancesFor(tenantId)
  if (priceCents > carSavingsCents) {
    return { error: `Price is more than their car savings (${formatCents(carSavingsCents)}). Offer a car that fits.` }
  }

  const offer = await createCarOffer({ tenantId, vehicle, priceCents, notes: notes || undefined })
  if (!offer) return { error: 'This tenant already has an open offer — withdraw it first.' }

  let emailNote = ''
  try {
    await sendCarOfferEmail({
      to: tenant.email,
      name: tenant.name,
      vehicle,
      price: formatCents(priceCents),
      savings: formatCents(carSavingsCents),
    })
  } catch (err) {
    logError('car-offers/email', err, { tenantId })
    emailNote = ' (the email failed — let the tenant know directly)'
  }

  revalidateCar(tenantId)
  return { ok: `Offer sent: ${vehicle} for ${formatCents(priceCents)}${emailNote}.` }
}

export async function withdrawCarOfferAction(fd: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const offerId = String(fd.get('offerId') ?? '')
  const offer = await getCarOffer(offerId)
  if (!offer) redirect('/admin/tenants')
  await transitionCarOffer(offerId, ['offered', 'accepted'], 'withdrawn')
  revalidateCar(offer!.tenantId)
  redirect(`/admin/tenants/${offer!.tenantId}`)
}

/**
 * The tenant accepted and the car was bought: release the savings. Ledger
 * first (idempotent on the offer id), then the status — a retry after a
 * partial failure just finishes the job.
 */
export async function markCarPurchasedAction(_prev: CarOfferFormState, fd: FormData): Promise<CarOfferFormState> {
  await requireRole('admin', '/admin/login')
  const offerId = String(fd.get('offerId') ?? '')
  const offer = await getCarOffer(offerId)
  if (!offer) return { error: 'Offer not found.' }
  if (offer.status !== 'accepted') return { error: 'Only an accepted offer can be marked purchased.' }

  const ref = `car:${offerId}`
  try {
    // A previous attempt may have recorded the release and then failed before
    // updating the status — in that case just finish the status change.
    if (!(await hasLedgerRef(ref))) {
      // Re-check: an adjustment since the offer could have reduced the savings.
      const { carSavingsCents } = await balancesFor(offer.tenantId)
      if (carSavingsCents < offer.priceCents) {
        return { error: `Car savings (${formatCents(carSavingsCents)}) no longer cover the price.` }
      }
      // Two concurrent clicks both reach here; the unique ref makes the second a no-op.
      await recordLedgerEntry({
        tenantId: offer.tenantId,
        bucket: 'car',
        kind: 'car_release',
        amountCents: -offer.priceCents,
        ref,
        at: new Date(),
        source: 'admin',
        note: offer.vehicle,
      })
    }
  } catch (err) {
    logError('car-offers/release', err, { tenantId: offer.tenantId })
    return { error: 'Could not record the release. Please try again.' }
  }

  await transitionCarOffer(offerId, ['accepted'], 'purchased')
  revalidateCar(offer.tenantId)
  return { ok: `Marked purchased — ${formatCents(offer.priceCents)} released from car savings.` }
}

// ---- Tenant ----

/** Tenant accepts or declines THEIR open offer. Ownership is enforced in the update query. */
export async function respondCarOfferAction(fd: FormData): Promise<void> {
  const session = await requireRole('tenant', '/tenants/login')
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant) redirect('/tenants')
  const decision = String(fd.get('decision') ?? '')
  if (decision !== 'accept' && decision !== 'decline') redirect('/tenants')

  const open = await getOpenCarOffer(tenant!.id)
  const offerId = String(fd.get('offerId') ?? '')
  if (!open || open.id !== offerId) redirect('/tenants')

  await transitionCarOffer(offerId, ['offered'], decision === 'accept' ? 'accepted' : 'declined', {
    tenantId: tenant!.id,
  })
  revalidateCar(tenant!.id)
  redirect(`/tenants?car=${decision === 'accept' ? 'accepted' : 'declined'}#car-offer`)
}
