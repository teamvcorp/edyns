import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getSession, type Role, type SessionPayload } from './session'

/**
 * Data Access Layer — the single source of truth for "is this request allowed".
 *
 * Proxy (proxy.ts) does optimistic redirects, but every protected page/action
 * must still call these so a forged or missing cookie can't slip through.
 * `cache` dedupes the cookie read within a single render pass.
 */

export const getCurrentSession = cache(getSession)

/** Require any authenticated session, else redirect to the given login page. */
export async function requireSession(loginPath: string): Promise<SessionPayload> {
  const session = await getCurrentSession()
  if (!session) redirect(loginPath)
  return session
}

/** Require a session with a specific role, else redirect to that role's login. */
export async function requireRole(role: Role, loginPath: string): Promise<SessionPayload> {
  const session = await getCurrentSession()
  if (!session || session.role !== role) redirect(loginPath)
  return session
}
