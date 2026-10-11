'use server'

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import { isEmailTaken } from '@/lib/users'
import { getPropertyById } from '@/lib/properties'
import { createInvite, reissueInvite, getInviteById, INVITE_TTL_DAYS, type TenantInvite } from '@/lib/invites'
import { sendTenantInviteEmail } from '@/lib/email'
import { rateLimit } from '@/lib/ratelimit'
import { formatAddress } from '@/lib/format'
import { tierLabel } from '@/lib/tiers'

export type InviteState = { errors?: Record<string, string>; values?: Record<string, string>; message?: string } | undefined

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

// Invites send real email to arbitrary addresses, so cap them even for admins
// (limits damage from a hijacked admin session or a runaway script).
const INVITE_LIMIT = 30
const INVITE_WINDOW_MS = 60 * 60 * 1000

/**
 * Build + send the invite email. The property block is re-validated at send time
 * (it must still exist and be approved) so a stale/removed property is simply
 * omitted rather than advertised.
 */
async function emailInvite(invite: TenantInvite, token: string): Promise<boolean> {
  let property
  if (invite.propertyId) {
    const p = await getPropertyById(invite.propertyId)
    if (p && p.status === 'approved') {
      property = {
        address: formatAddress(p.address),
        tierLabel: `Tier ${p.tier ?? 0} · ${tierLabel(p.tier)}`,
        url: `${baseUrl}/properties/${p.id}`,
        thumbnailUrl: p.thumbnailUrl,
      }
    }
  }
  try {
    await sendTenantInviteEmail({
      to: invite.email,
      name: invite.name,
      enrollUrl: `${baseUrl}/tenants/enroll?invite=${encodeURIComponent(token)}`,
      expiresInDays: INVITE_TTL_DAYS,
      property,
    })
    return true
  } catch {
    return false
  }
}

/** Admin invites someone to apply: name + email, optionally the property they found us through. */
export async function inviteTenantAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  await requireRole('admin', '/admin/login')

  const get = (k: string) => String(formData.get(k) ?? '').trim()
  const values = { name: get('name'), email: get('email'), propertyId: get('propertyId') }

  const errors: Record<string, string> = {}
  if (!values.name) errors.name = 'Enter the person’s name.'
  else if (values.name.length > 120) errors.name = 'That name is too long.'
  if (!values.email) errors.email = 'Enter an email.'
  else if (!emailRe.test(values.email)) errors.email = 'Enter a valid email.'
  if (Object.keys(errors).length > 0) return { errors, values }

  // Only an existing, approved property may be attached (never trust the posted id).
  if (values.propertyId) {
    const p = await getPropertyById(values.propertyId)
    if (!p || p.status !== 'approved') return { errors: { propertyId: 'Choose an approved property.' }, values }
  }

  if (await isEmailTaken(values.email, 'tenant')) {
    return { errors: { email: 'A tenant account with this email already exists.' }, values }
  }

  const { allowed } = await rateLimit({ key: 'invite:tenant', limit: INVITE_LIMIT, windowMs: INVITE_WINDOW_MS })
  if (!allowed) return { message: 'Too many invites sent this hour. Please try again later.', values }

  const { invite, token } = await createInvite({
    name: values.name,
    email: values.email,
    propertyId: values.propertyId || undefined,
  })
  const emailed = await emailInvite(invite, token)

  redirect(`/admin/tenants?invited=${emailed ? 'sent' : 'failed'}`)
}

/** Re-send an unused invite with a fresh link (the previous link stops working). */
export async function resendInviteAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')

  const existing = await getInviteById(id)
  if (!existing || existing.status === 'used') redirect('/admin/tenants?invited=unavailable')

  // The invitee may have registered by other means since the invite went out.
  if (await isEmailTaken(existing.email, 'tenant')) redirect('/admin/tenants?invited=registered')

  const { allowed } = await rateLimit({ key: 'invite:tenant', limit: INVITE_LIMIT, windowMs: INVITE_WINDOW_MS })
  if (!allowed) redirect('/admin/tenants?invited=throttled')

  const reissued = await reissueInvite(id)
  if (!reissued) redirect('/admin/tenants?invited=unavailable')

  const emailed = await emailInvite(reissued.invite, reissued.token)
  redirect(`/admin/tenants?invited=${emailed ? 'sent' : 'failed'}`)
}
