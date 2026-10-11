import 'server-only'

import type { PropertyInput, PropertyStatus } from './properties'
import { MIN_TIER, MAX_TIER } from './tiers'

/**
 * Shared parsing + validation for property forms. Used by all three entry points
 * so the rules can never drift apart:
 *   - partner submits a property      (app/actions/properties.ts  → addProperty)
 *   - admin edits a property          (app/actions/admin.ts       → updatePropertyAction)
 *   - admin takes in a new property   (app/actions/admin-create.ts → createPropertyByAdmin)
 *
 * SECURITY: the partner path calls this WITHOUT `admin: true`, so status, tier,
 * equity and income-requirement fields are never even read from a partner's
 * form data — a partner cannot self-approve or set their own equity by posting
 * extra fields.
 */

const BASE_FIELDS = [
  'line1', 'line2', 'city', 'state', 'postalCode', 'country',
  'bedrooms', 'bathrooms', 'squareFeet', 'lotSize', 'lat', 'lng',
  'assessedValue', 'askingPrice', 'thumbnailUrl', 'galleryUrls',
] as const

const ADMIN_FIELDS = ['status', 'equityGenerated', 'tier', 'incomeRequirement', 'equitySharePercent'] as const

const STATUSES: PropertyStatus[] = ['pending', 'approved', 'rejected']

/** Images must be https files on our own Vercel Blob store (matches next.config.ts remotePatterns). */
const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com'

export function isBlobImageUrl(u: unknown): u is string {
  if (typeof u !== 'string') return false
  try {
    const url = new URL(u)
    return url.protocol === 'https:' && url.hostname.endsWith(BLOB_HOST_SUFFIX)
  } catch {
    return false
  }
}

function num(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export interface AdminPropertyFields {
  status: PropertyStatus
  equityGenerated?: number
  equitySharePercent?: number
}

export type PropertyParseResult =
  | { ok: false; errors: Record<string, string>; values: Record<string, string> }
  | { ok: true; values: Record<string, string>; input: PropertyInput; admin?: AdminPropertyFields }

export function parsePropertyForm(formData: FormData, opts: { admin?: boolean } = {}): PropertyParseResult {
  const get = (k: string) => String(formData.get(k) ?? '').trim()
  const fields: readonly string[] = opts.admin ? [...BASE_FIELDS, ...ADMIN_FIELDS] : BASE_FIELDS
  const values: Record<string, string> = {}
  for (const f of fields) values[f] = get(f)

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

  // Images: only our own Blob store is accepted (drops anything else).
  const thumbnailUrl = isBlobImageUrl(values.thumbnailUrl) ? values.thumbnailUrl : undefined
  let galleryUrls: string[] = []
  if (values.galleryUrls) {
    try {
      const parsed = JSON.parse(values.galleryUrls)
      if (Array.isArray(parsed)) galleryUrls = parsed.filter(isBlobImageUrl)
    } catch {
      /* ignore malformed */
    }
  }

  // Admin-only fields
  let admin: AdminPropertyFields | undefined
  let tier: number | null = null
  let incomeRequirement: number | null = null
  if (opts.admin) {
    const status = values.status as PropertyStatus
    if (!STATUSES.includes(status)) errors.status = 'Choose a valid status.'

    const equityGenerated = num(values.equityGenerated)
    tier = num(values.tier)
    incomeRequirement = num(values.incomeRequirement)
    const equitySharePercent = num(values.equitySharePercent)
    if (equitySharePercent !== null && (equitySharePercent < 0 || equitySharePercent > 100)) {
      errors.equitySharePercent = 'Equity share must be between 0 and 100.'
    }
    // An approved property is public and earns equity, so it must be fully priced.
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
    admin = {
      status,
      equityGenerated: equityGenerated ?? undefined,
      equitySharePercent: equitySharePercent ?? undefined,
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors, values }

  const input: PropertyInput = {
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
    thumbnailUrl,
    galleryUrls,
    assessedValue: assessedValue!,
    askingPrice: askingPrice!,
  }
  if (opts.admin) {
    input.tier = tier ?? undefined
    input.incomeRequirement = incomeRequirement ?? undefined
  }
  return { ok: true, values, input, admin }
}
