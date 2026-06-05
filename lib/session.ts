import 'server-only'

import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'

/**
 * Stateless session management using a signed JWT stored in an HttpOnly cookie.
 *
 * This follows the pattern documented in the Next.js 16 authentication guide
 * (jose + cookies). We reuse NEXTAUTH_SECRET as the signing key so there is a
 * single secret to manage.
 */

export type Role = 'partner' | 'tenant' | 'admin'

export interface SessionPayload {
  /** Mongo user id, or 'admin' for the password-gated admin. */
  sub: string
  role: Role
  name?: string
  [key: string]: unknown
}

export const SESSION_COOKIE = 'edyns_session'
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const secret = process.env.NEXTAUTH_SECRET
if (!secret) {
  throw new Error('Missing NEXTAUTH_SECRET environment variable')
}
const encodedKey = new TextEncoder().encode(secret)

export async function encrypt(payload: SessionPayload, expiresAt: Date): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(encodedKey)
}

/**
 * Verify and decode a session token. Returns null for missing/invalid tokens
 * so callers never have to catch. Safe to call from `proxy.ts` (pass the raw
 * cookie value) as well as Server Components / Actions.
 */
export async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ['HS256'] })
    return payload as SessionPayload
  } catch {
    return null
  }
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  const token = await encrypt(payload, expiresAt)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  })
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  return decrypt(cookieStore.get(SESSION_COOKIE)?.value)
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
