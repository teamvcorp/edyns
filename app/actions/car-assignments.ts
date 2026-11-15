'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/dal'
import { getTenantById } from '@/lib/tenants'
import { PROGRAMS, programOf, carEligibleOn, carTrustComplete, CAR_TRUST_MONTHS } from '@/lib/programs'
import { balancesFor } from '@/lib/program-ledger'
import { assignCar, getCarAssignment, returnCar } from '@/lib/car-assignments'
import { sendCarAssignedEmail } from '@/lib/email'
import { logError } from '@/lib/log'

/**
 * Car program (lib/car-assignments.ts): admins provide an edynsgate-owned car
 * (insurance paid by edynsgate) after the trust period, and mark it returned
 * when the tenant stops paying or leaves. Admin-only; every rule is re-checked
 * here on the server.
 */

export type CarFormState = { error?: string; ok?: string } | undefined

const MAX_SHORT = 100
const MAX_TEXT = 500

const field = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? '').trim().slice(0, max)

function revalidateCar(tenantId: string) {
  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath('/tenants')
}

export async function assignCarAction(_prev: CarFormState, fd: FormData): Promise<CarFormState> {
  await requireRole('admin', '/admin/login')

  const tenantId = String(fd.get('tenantId') ?? '')
  const vehicle = field(fd, 'vehicle', 200)
  const vin = field(fd, 'vin', MAX_SHORT)
  const plate = field(fd, 'plate', MAX_SHORT)
  const insurance = field(fd, 'insurance', 200)
  const notes = field(fd, 'notes', MAX_TEXT)
  const early = fd.get('early') === 'on'

  if (vehicle.length < 3) return { error: 'Describe the vehicle (year, make, model).' }

  const tenant = await getTenantById(tenantId)
  if (!tenant) return { error: 'Tenant not found.' }
  if (PROGRAMS[programOf(tenant)].carRate === 0) return { error: 'This tenant isn’t in the car program.' }
  if (tenant.status !== 'approved') return { error: 'Approve the tenant first.' }

  // Trust period: CAR_TRUST_MONTHS of payments, unless the admin explicitly goes early.
  const { firstCarPaymentAt } = await balancesFor(tenantId)
  const eligibleOn = carEligibleOn(firstCarPaymentAt)
  const trusted = carTrustComplete(firstCarPaymentAt)
  if (!trusted && !early) {
    return {
      error: eligibleOn
        ? `The ${CAR_TRUST_MONTHS}-month trust period ends ${eligibleOn.toLocaleDateString()}. Tick “provide early” to assign now.`
        : `No car payments yet. Tick “provide early” to assign before the ${CAR_TRUST_MONTHS}-month trust period.`,
    }
  }

  const car = await assignCar({
    tenantId,
    vehicle,
    vin: vin || undefined,
    plate: plate || undefined,
    insurance: insurance || undefined,
    notes: notes || undefined,
    early: !trusted,
  })
  if (!car) return { error: 'This tenant already has an active car — mark it returned first.' }

  let emailNote = ''
  try {
    await sendCarAssignedEmail({ to: tenant.email, name: tenant.name, vehicle })
  } catch (err) {
    logError('car-assignments/email', err, { tenantId })
    emailNote = ' (the email failed — let the tenant know directly)'
  }

  revalidateCar(tenantId)
  return { ok: `Car assigned: ${vehicle}${emailNote}.` }
}

export async function returnCarAction(_prev: CarFormState, fd: FormData): Promise<CarFormState> {
  await requireRole('admin', '/admin/login')
  const assignmentId = String(fd.get('assignmentId') ?? '')
  const reason = field(fd, 'reason', MAX_TEXT)
  if (!reason) return { error: 'Give a reason (e.g. stopped paying, left the program).' }

  const car = await getCarAssignment(assignmentId)
  if (!car) return { error: 'Car assignment not found.' }
  if (!(await returnCar(assignmentId, reason))) return { error: 'This car is already marked returned.' }

  revalidateCar(car.tenantId)
  return { ok: `${car.vehicle} marked returned.` }
}
