import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getSession, type Role, type SessionPayload } from './session'
import { getSessionState } from './users'

/**
 * Data Access Layer — the single source of truth for "is this request allowed".
 *
 * Proxy (proxy.ts) does optimistic redirects, but every protected page/action
 * must still call these so a forged or missing cookie can't slip through.
 * `cache` dedupes the work within a single render pass.
 *
 * Unlike the proxy, the DAL also checks the database for partners/tenants:
 *  - the account must still exist (deleted users are signed out), and
 *  - the cookie's `ver` must match users.sessionVersion (a password change or
 *    admin reset revokes every older session).
 * The stored `mustReset` flag is authoritative too, so a temp-password session
 * can't skip the set-password step by calling actions directly.
 */

/** Validated session, or null. Never redirects — safe for Route Handlers (return 401). */
export const getCurrentSession = cache(async (): Promise<SessionPayload | null> => {
  const session = await getSession()
  if (!session) return null
  if (session.role === 'admin') return session // password-only admin has no user record

  const state = await getSessionState(session.sub)
  if (!state || state.sessionVersion !== (session.ver ?? 0)) return null
  return { ...session, mustReset: state.mustReset }
})

/** Require any authenticated session, else redirect to the given login page. */
export async function requireSession(loginPath: string): Promise<SessionPayload> {
  const session = await getCurrentSession()
  if (!session) redirect(loginPath)
  return session
}

/**
 * Require a session with a specific role, else redirect to that role's login.
 * Users on a temp password are sent to set-password unless the caller opts in
 * with `allowMustReset` (only the set-password page/action should).
 */
export async function requireRole(
  role: Role,
  loginPath: string,
  opts: { allowMustReset?: boolean } = {},
): Promise<SessionPayload> {
  const session = await getCurrentSession()
  if (!session || session.role !== role) redirect(loginPath)
  if (session.mustReset && !opts.allowMustReset && role !== 'admin') {
    redirect(role === 'tenant' ? '/tenants/set-password' : '/partners/set-password')
  }
  return session
}

/** For login pages: send an already-validly-signed-in user straight to their portal. */
export async function redirectIfSignedIn(role: Role, portalPath: string): Promise<void> {
  const session = await getCurrentSession()
  if (session?.role === role) redirect(portalPath)
}

/** Route Handler variant: the validated session if it has one of `roles`, else null (caller returns 401). */
export async function sessionWithRole(...roles: Role[]): Promise<SessionPayload | null> {
  const session = await getCurrentSession()
  if (!session || !roles.includes(session.role)) return null
  if (session.mustReset && session.role !== 'admin') return null
  return session
}
