'use server'

import { redirect } from 'next/navigation'
import { createSession, deleteSession, getSession } from '@/lib/session'
import { verifyCredentials, setUserPassword } from '@/lib/users'
import { rateLimit, getClientIp } from '@/lib/ratelimit'

export type AuthState = { error?: string } | undefined
export type SetPasswordState = { error?: string } | undefined

const portalFor = { partner: '/partners', tenant: '/tenants' } as const

// Credential-stuffing throttle: cap login attempts per IP in a rolling window.
const LOGIN_LIMIT = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const TOO_MANY = 'Too many attempts. Please wait a few minutes and try again.'

async function loginWithCredentials(
  role: 'partner' | 'tenant',
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { error: 'Enter your email and password.' }
  }

  const ip = await getClientIp()
  const { allowed } = await rateLimit({ key: `login:${role}:${ip}`, limit: LOGIN_LIMIT, windowMs: LOGIN_WINDOW_MS })
  if (!allowed) return { error: TOO_MANY }

  const user = await verifyCredentials(email, password, role)
  if (!user) {
    return { error: 'Invalid email or password.' }
  }

  await createSession({ sub: user.id, role: user.role, name: user.name, mustReset: user.mustReset })
  // Temp-password users must choose a new password before using the portal.
  redirect(user.mustReset ? `${portalFor[role]}/set-password` : portalFor[role]) // throws NEXT_REDIRECT
}

export async function loginPartner(_prev: AuthState, formData: FormData): Promise<AuthState> {
  return loginWithCredentials('partner', formData)
}

export async function loginTenant(_prev: AuthState, formData: FormData): Promise<AuthState> {
  return loginWithCredentials('tenant', formData)
}

export async function loginAdmin(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get('password') ?? '')
  const expected = process.env.ADMIN_PASSWORD

  if (!expected) {
    return { error: 'Admin access is not configured.' }
  }

  const ip = await getClientIp()
  const { allowed } = await rateLimit({ key: `login:admin:${ip}`, limit: LOGIN_LIMIT, windowMs: LOGIN_WINDOW_MS })
  if (!allowed) return { error: TOO_MANY }

  if (!password || password !== expected) {
    return { error: 'Incorrect password.' }
  }

  await createSession({ sub: 'admin', role: 'admin', name: 'Administrator' })
  redirect('/admin')
}

/**
 * Set a new password for the signed-in tenant/partner. Clears the force-reset
 * flag and reissues a clean session, then sends them into their portal. Used both
 * for the forced temp-password reset and voluntary password changes.
 */
export async function setPasswordAction(_prev: SetPasswordState, formData: FormData): Promise<SetPasswordState> {
  const session = await getSession()
  if (!session || (session.role !== 'tenant' && session.role !== 'partner')) redirect('/')

  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }
  if (password !== confirm) return { error: 'Passwords do not match.' }

  const ok = await setUserPassword(session.sub, password)
  if (!ok) return { error: 'Could not update your password. Please try again.' }

  // Reissue a session without the reset flag so the portal is usable again.
  await createSession({ sub: session.sub, role: session.role, name: session.name })
  redirect(session.role === 'tenant' ? '/tenants' : '/partners')
}

export async function logout(): Promise<void> {
  await deleteSession()
  redirect('/')
}
