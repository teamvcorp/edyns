'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import { createProperty, deletePendingProperty, getPropertyById } from '@/lib/properties'
import { listEquityEntriesByProperty } from '@/lib/equity'
import { findPartnerById } from '@/lib/users'
import { sendEquityReportEmail } from '@/lib/email'
import { formatAddress } from '@/lib/format'

export type PropertyFormState =
  | { errors?: Record<string, string>; values?: Record<string, string>; message?: string }
  | undefined

const textFields = [
  'line1',
  'line2',
  'city',
  'state',
  'postalCode',
  'country',
  'bedrooms',
  'bathrooms',
  'squareFeet',
  'lotSize',
  'lat',
  'lng',
  'assessedValue',
  'askingPrice',
  'thumbnailUrl',
  'galleryUrls',
] as const

function num(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function addProperty(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  const session = await requireRole('partner', '/partners/login')

  const get = (k: string) => String(formData.get(k) ?? '').trim()
  const values: Record<string, string> = {}
  for (const f of textFields) values[f] = get(f)

  const errors: Record<string, string> = {}

  // Address
  if (!values.line1) errors.line1 = 'Enter the street address.'
  if (!values.city) errors.city = 'Enter the city.'
  if (!values.state) errors.state = 'Enter the state/region.'
  if (!values.postalCode) errors.postalCode = 'Enter the postal code.'
  if (!values.country) errors.country = 'Enter the country.'

  // Numbers
  const bedrooms = num(values.bedrooms)
  const bathrooms = num(values.bathrooms)
  const squareFeet = num(values.squareFeet)
  const assessedValue = num(values.assessedValue)
  const askingPrice = num(values.askingPrice)
  if (bedrooms === null || bedrooms < 0) errors.bedrooms = 'Enter the number of rooms.'
  if (bathrooms === null || bathrooms < 0) errors.bathrooms = 'Enter the number of bathrooms.'
  if (squareFeet === null || squareFeet <= 0) errors.squareFeet = 'Enter the square footage.'
  if (!values.lotSize) errors.lotSize = 'Enter the land/lot size.'
  if (assessedValue === null || assessedValue < 0) errors.assessedValue = 'Enter the current assessed value.'
  if (askingPrice === null || askingPrice < 0) errors.askingPrice = 'Enter the asking purchase price.'

  // Coordinates (both or neither)
  const lat = num(values.lat)
  const lng = num(values.lng)
  if ((values.lat && lat === null) || (values.lng && lng === null)) {
    errors.lat = 'Coordinates must be numbers.'
  }
  if ((values.lat && !values.lng) || (!values.lat && values.lng)) {
    errors.lat = 'Enter both latitude and longitude.'
  }

  // Gallery URLs (JSON array from the client)
  let galleryUrls: string[] = []
  if (values.galleryUrls) {
    try {
      const parsed = JSON.parse(values.galleryUrls)
      if (Array.isArray(parsed)) galleryUrls = parsed.filter((u) => typeof u === 'string')
    } catch {
      /* ignore malformed */
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors, values }
  }

  await createProperty(session.sub, {
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
  })

  revalidatePath('/partners/properties')
  redirect('/partners/properties') // throws NEXT_REDIRECT — keep outside try/catch
}

export async function deleteProperty(formData: FormData): Promise<void> {
  const session = await requireRole('partner', '/partners/login')
  const id = String(formData.get('id') ?? '')
  await deletePendingProperty(id, session.sub)
  revalidatePath('/partners/properties')
}

/** Email the signed-in partner their equity report for one of their properties. */
export async function emailEquityReportAction(formData: FormData): Promise<void> {
  const session = await requireRole('partner', '/partners/login')
  const propertyId = String(formData.get('propertyId') ?? '').trim()

  const property = await getPropertyById(propertyId)
  // Only the owning partner may email a property's report.
  if (!property || property.partnerId !== session.sub) redirect('/partners/properties?report=failed')

  const partner = await findPartnerById(session.sub)
  if (!partner?.email) redirect('/partners/properties?report=failed')

  const entries = await listEquityEntriesByProperty(propertyId)
  const startOfYear = new Date(new Date().getFullYear(), 0, 1)
  const ytdCents = entries
    .filter((e) => new Date(e.paidAt) >= startOfYear)
    .reduce((sum, e) => sum + e.equityCents, 0)
  const lifetimeCents = entries.reduce((sum, e) => sum + e.equityCents, 0)

  let sent = true
  try {
    await sendEquityReportEmail({
      to: partner.email,
      name: partner.name,
      propertyLabel: formatAddress(property.address),
      entries,
      ytdCents,
      lifetimeCents,
    })
  } catch {
    sent = false
  }
  redirect(`/partners/properties?report=${sent ? 'sent' : 'failed'}`)
}
