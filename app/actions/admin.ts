'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import {
  approveProperty,
  rejectProperty,
  updateProperty,
  adminDeleteProperty,
  listPropertiesByPartner,
  getPropertyById,
} from '@/lib/properties'
import { updatePartner, deletePartner } from '@/lib/users'
import { approveTenant, rejectTenant, placeTenant } from '@/lib/tenants'
import { getRequestById, setRequestStatus } from '@/lib/moveins'
import { MIN_TIER, MAX_TIER } from '@/lib/tiers'

export type AdminActionState = { error?: string } | undefined

export async function approvePropertyAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireRole('admin', '/admin/login')

  const id = String(formData.get('id') ?? '')
  const equity = Number(String(formData.get('equityGenerated') ?? '').trim())
  const tier = Number(String(formData.get('tier') ?? '').trim())
  const incomeRequirement = Number(String(formData.get('incomeRequirement') ?? '').trim())

  if (!id) return { error: 'Missing property id.' }
  if (!Number.isFinite(equity) || equity < 0) {
    return { error: 'Enter the equity amount to generate for this partner.' }
  }
  if (!Number.isInteger(tier) || tier < MIN_TIER || tier > MAX_TIER) {
    return { error: 'Choose a housing tier.' }
  }
  if (!Number.isFinite(incomeRequirement) || incomeRequirement < 0) {
    return { error: 'Enter the monthly income requirement.' }
  }

  const ok = await approveProperty(id, { equityGenerated: equity, tier, incomeRequirement })
  if (!ok) return { error: 'Property not found.' }

  revalidatePath('/admin/properties')
  revalidatePath('/properties')
  return undefined
}

export async function rejectPropertyAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireRole('admin', '/admin/login')

  const id = String(formData.get('id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()

  if (!id) return { error: 'Missing property id.' }

  const ok = await rejectProperty(id, reason || 'No reason provided.')
  if (!ok) return { error: 'Property not found.' }

  revalidatePath('/admin/properties')
  return undefined
}

// ---- Partner account management ----

export type PartnerEditState =
  | { errors?: Record<string, string>; values?: Record<string, string>; message?: string; ok?: boolean }
  | undefined

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function updatePartnerAction(_prev: PartnerEditState, formData: FormData): Promise<PartnerEditState> {
  await requireRole('admin', '/admin/login')

  const get = (k: string) => String(formData.get(k) ?? '').trim()
  const id = get('id')
  const fields = ['name', 'email', 'phone', 'line1', 'line2', 'city', 'state', 'postalCode', 'country', 'taxId']
  const values: Record<string, string> = {}
  for (const f of fields) values[f] = get(f)

  const errors: Record<string, string> = {}
  if (!values.name) errors.name = 'Enter a name.'
  if (!values.email) errors.email = 'Enter an email.'
  else if (!emailRe.test(values.email)) errors.email = 'Enter a valid email.'
  if (!values.phone) errors.phone = 'Enter a phone number.'
  if (!values.line1) errors.line1 = 'Enter the street address.'
  if (!values.city) errors.city = 'Enter the city.'
  if (!values.state) errors.state = 'Enter the state/region.'
  if (!values.postalCode) errors.postalCode = 'Enter the postal code.'
  if (!values.country) errors.country = 'Enter the country.'

  if (Object.keys(errors).length > 0) return { errors, values }

  const res = await updatePartner(id, {
    name: values.name,
    email: values.email,
    phone: values.phone,
    billingAddress: {
      line1: values.line1,
      line2: values.line2 || undefined,
      city: values.city,
      state: values.state,
      postalCode: values.postalCode,
      country: values.country,
    },
    taxId: values.taxId || undefined,
  })

  if (!res.ok) return { message: res.error, values }

  revalidatePath('/admin/partners')
  revalidatePath(`/admin/partners/${id}`)
  return { ok: true, values }
}

export async function deletePartnerAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')

  // Guard: don't delete a partner who still has properties (equity at stake).
  const props = await listPropertiesByPartner(id)
  if (props.length > 0) {
    redirect(`/admin/partners/${id}?error=has-properties`)
  }

  await deletePartner(id)
  revalidatePath('/admin/partners')
  redirect('/admin/partners')
}

// ---- Admin property edit / delete ----

export type PropertyEditState =
  | { errors?: Record<string, string>; values?: Record<string, string>; message?: string; ok?: boolean }
  | undefined

function num(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function updatePropertyAction(_prev: PropertyEditState, formData: FormData): Promise<PropertyEditState> {
  await requireRole('admin', '/admin/login')

  const get = (k: string) => String(formData.get(k) ?? '').trim()
  const id = get('id')
  const fields = [
    'line1', 'line2', 'city', 'state', 'postalCode', 'country',
    'bedrooms', 'bathrooms', 'squareFeet', 'lotSize', 'lat', 'lng',
    'assessedValue', 'askingPrice', 'status', 'equityGenerated', 'tier', 'incomeRequirement',
    'thumbnailUrl', 'galleryUrls',
  ]
  const values: Record<string, string> = {}
  for (const f of fields) values[f] = get(f)

  const errors: Record<string, string> = {}
  if (!values.line1) errors.line1 = 'Enter the street address.'
  if (!values.city) errors.city = 'Enter the city.'
  if (!values.state) errors.state = 'Enter the state/region.'
  if (!values.postalCode) errors.postalCode = 'Enter the postal code.'
  if (!values.country) errors.country = 'Enter the country.'

  const bedrooms = num(values.bedrooms)
  const bathrooms = num(values.bathrooms)
  const squareFeet = num(values.squareFeet)
  const assessedValue = num(values.assessedValue)
  const askingPrice = num(values.askingPrice)
  if (bedrooms === null || bedrooms < 0) errors.bedrooms = 'Enter the number of rooms.'
  if (bathrooms === null || bathrooms < 0) errors.bathrooms = 'Enter the number of bathrooms.'
  if (squareFeet === null || squareFeet <= 0) errors.squareFeet = 'Enter the square footage.'
  if (!values.lotSize) errors.lotSize = 'Enter the land/lot size.'
  if (assessedValue === null || assessedValue < 0) errors.assessedValue = 'Enter the assessed value.'
  if (askingPrice === null || askingPrice < 0) errors.askingPrice = 'Enter the asking price.'

  const status = values.status as 'pending' | 'approved' | 'rejected'
  if (!['pending', 'approved', 'rejected'].includes(status)) errors.status = 'Choose a valid status.'

  const lat = num(values.lat)
  const lng = num(values.lng)
  if ((values.lat && lat === null) || (values.lng && lng === null)) errors.lat = 'Coordinates must be numbers.'

  const equityGenerated = num(values.equityGenerated)
  const tier = num(values.tier)
  const incomeRequirement = num(values.incomeRequirement)
  if (status === 'approved') {
    if (equityGenerated === null || equityGenerated < 0) {
      errors.equityGenerated = 'Set the equity generated for an approved property.'
    }
    if (tier === null || !Number.isInteger(tier) || tier < MIN_TIER || tier > MAX_TIER) {
      errors.tier = 'Choose a housing tier.'
    }
    if (incomeRequirement === null || incomeRequirement < 0) {
      errors.incomeRequirement = 'Set the monthly income requirement.'
    }
  }

  let galleryUrls: string[] = []
  if (values.galleryUrls) {
    try {
      const parsed = JSON.parse(values.galleryUrls)
      if (Array.isArray(parsed)) galleryUrls = parsed.filter((u) => typeof u === 'string')
    } catch {
      /* ignore */
    }
  }

  if (Object.keys(errors).length > 0) return { errors, values }

  const ok = await updateProperty(id, {
    address: {
      line1: values.line1,
      line2: values.line2 || undefined,
      city: values.city,
      state: values.state,
      postalCode: values.postalCode,
      country: values.country,
    },
    bedrooms: bedrooms!,
    bathrooms: bathrooms!,
    squareFeet: squareFeet!,
    lotSize: values.lotSize,
    coordinates: lat !== null && lng !== null ? { lat, lng } : undefined,
    thumbnailUrl: values.thumbnailUrl || undefined,
    galleryUrls,
    assessedValue: assessedValue!,
    askingPrice: askingPrice!,
    tier: tier ?? undefined,
    incomeRequirement: incomeRequirement ?? undefined,
    status,
    equityGenerated: equityGenerated ?? undefined,
  })

  if (!ok) return { message: 'Property not found.', values }

  revalidatePath('/admin/properties')
  revalidatePath(`/admin/properties/${id}`)
  revalidatePath('/properties')
  return { ok: true, values }
}

export async function adminDeletePropertyAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  await adminDeleteProperty(id)
  revalidatePath('/admin/properties')
  redirect('/admin/properties')
}

// ---- Tenant application review ----

export async function approveTenantAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Missing tenant id.' }
  const ok = await approveTenant(id)
  if (!ok) return { error: 'Tenant not found.' }
  revalidatePath('/admin/tenants')
  revalidatePath(`/admin/tenants/${id}`)
  return undefined
}

export async function rejectTenantAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (!id) return { error: 'Missing tenant id.' }
  const ok = await rejectTenant(id, reason || 'No reason provided.')
  if (!ok) return { error: 'Tenant not found.' }
  revalidatePath('/admin/tenants')
  revalidatePath(`/admin/tenants/${id}`)
  return undefined
}

// ---- Move-in requests ----

export async function approveMoveInAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  const req = await getRequestById(id)
  if (req) {
    const property = await getPropertyById(req.propertyId)
    await setRequestStatus(id, 'approved')
    // Place the tenant at the property's tier.
    if (property) await placeTenant(req.tenantId, req.propertyId, property.tier ?? 0)
  }
  revalidatePath('/admin/move-ins')
}

export async function declineMoveInAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  await setRequestStatus(id, 'declined')
  revalidatePath('/admin/move-ins')
}
