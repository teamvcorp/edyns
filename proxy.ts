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

const areas: { prefix: string; login: string; role: Role; publicPaths: string[] }[] = [
  { prefix: '/partners', login: '/partners/login', role: 'partner', publicPaths: ['/partners/login', '/partners/enroll'] },
  { prefix: '/tenants', login: '/tenants/login', role: 'tenant', publicPaths: ['/tenants/login', '/tenants/enroll'] },
  { prefix: '/admin', login: '/admin/login', role: 'admin', publicPaths: ['/admin/login'] },
]

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const area = areas.find((a) => pathname === a.prefix || pathname.startsWith(a.prefix + '/'))
  if (!area) return NextResponse.next()

  const session = await decrypt(req.cookies.get(SESSION_COOKIE)?.value)
  const isPublicPath = area.publicPaths.includes(pathname)

  // Public pages (login, enroll): if already signed in with the right role,
  // skip them and go to the portal; otherwise allow through.
  if (isPublicPath) {
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
