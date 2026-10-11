'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import { createProperty, deletePendingProperty, getPropertyById } from '@/lib/properties'
import { parsePropertyForm } from '@/lib/property-input'
import { listEquityEntriesByProperty } from '@/lib/equity'
import { findPartnerById } from '@/lib/users'
import { sendEquityReportEmail } from '@/lib/email'
import { formatAddress } from '@/lib/format'

export type PropertyFormState =
  | { errors?: Record<string, string>; values?: Record<string, string>; message?: string }
  | undefined

/**
 * A partner submits a property. Parsing/validation is shared with the admin
 * actions (lib/property-input.ts); called WITHOUT `admin` so a partner can never
 * set status, tier or equity. Always saved as pending until an admin approves.
 */
export async function addProperty(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  const session = await requireRole('partner', '/partners/login')

  const parsed = parsePropertyForm(formData)
  if (!parsed.ok) return { errors: parsed.errors, values: parsed.values }

  await createProperty(session.sub, parsed.input)

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
