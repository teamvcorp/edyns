'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/dal'
import { getTenantByUserId } from '@/lib/tenants'
import { getPropertyById } from '@/lib/properties'
import { hasActiveRequest, createMoveInRequest } from '@/lib/moveins'

export type MoveInState = { error?: string; ok?: boolean } | undefined

/** An approved tenant requests to move into a property they qualify for. */
export async function requestMoveIn(_prev: MoveInState, formData: FormData): Promise<MoveInState> {
  const session = await requireRole('tenant', '/tenants/login')
  const propertyId = String(formData.get('propertyId') ?? '')

  const tenant = await getTenantByUserId(session.sub)
  if (!tenant) return { error: 'No tenant application found.' }
  if (tenant.status !== 'approved') return { error: 'Your application must be approved before you can move in.' }

  const property = await getPropertyById(propertyId)
  if (!property || property.status !== 'approved') return { error: 'That property isn’t available.' }

  const required = property.incomeRequirement ?? 0
  if (tenant.employment.monthlyIncome < required) {
    return { error: `This tier requires $${required.toLocaleString()}/mo income.` }
  }

  if (await hasActiveRequest(tenant.id, propertyId)) {
    return { error: 'You already have a request for this property.' }
  }

  await createMoveInRequest(tenant.id, propertyId)
  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/tenants')
  return { ok: true }
}
