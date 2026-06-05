import { NextResponse, type NextRequest } from 'next/server'
import { decrypt, SESSION_COOKIE, type Role } from '@/lib/session'

/**
 * Proxy (formerly Middleware, renamed in Next.js 16) performs OPTIMISTIC auth
 * checks — it only reads the signed cookie, never the database. The real
 * authorization happens in the DAL (lib/dal.ts) on each protected page/action.
 *
 * Each area requires a matching role; mismatches are bounced to that area's
 * login. Already-authenticated users are kept out of the login pages.
 */

const areas: { prefix: string; login: string; role: Role }[] = [
  { prefix: '/partners', login: '/partners/login', role: 'partner' },
  { prefix: '/tenants', login: '/tenants/login', role: 'tenant' },
  { prefix: '/admin', login: '/admin/login', role: 'admin' },
]

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const area = areas.find((a) => pathname === a.prefix || pathname.startsWith(a.prefix + '/'))
  if (!area) return NextResponse.next()

  const session = await decrypt(req.cookies.get(SESSION_COOKIE)?.value)
  const isLoginPage = pathname === area.login

  // Authenticated with the right role visiting the login page → go to portal.
  if (isLoginPage) {
    if (session?.role === area.role) {
      return NextResponse.redirect(new URL(area.prefix, req.nextUrl))
    }
    return NextResponse.next()
  }

  // Any other page in the area requires the matching role.
  if (session?.role !== area.role) {
    return NextResponse.redirect(new URL(area.login, req.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/partners/:path*', '/tenants/:path*', '/admin/:path*'],
}
