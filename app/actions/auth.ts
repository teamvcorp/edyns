'use server'

import { redirect } from 'next/navigation'
import { createSession, deleteSession } from '@/lib/session'
import { verifyCredentials } from '@/lib/users'

export type AuthState = { error?: string } | undefined

const portalFor = { partner: '/partners', tenant: '/tenants' } as const

async function loginWithCredentials(
  role: 'partner' | 'tenant',
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { error: 'Enter your email and password.' }
  }

  const user = await verifyCredentials(email, password, role)
  if (!user) {
    return { error: 'Invalid email or password.' }
  }

  await createSession({ sub: user.id, role: user.role, name: user.name })
  redirect(portalFor[role]) // throws NEXT_REDIRECT — must stay outside try/catch
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
  if (!password || password !== expected) {
    return { error: 'Incorrect password.' }
  }

  await createSession({ sub: 'admin', role: 'admin', name: 'Administrator' })
  redirect('/admin')
}

export async function logout(): Promise<void> {
  await deleteSession()
  redirect('/')
}
