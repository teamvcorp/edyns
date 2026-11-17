import { sessionWithRole } from '@/lib/dal'
import { readLeaseFile } from '@/lib/leases'
import { EXTENSION } from '@/lib/files'

/**
 * Admin-only viewer for a tenant's encrypted lease (own-landlord program). This
 * is the ONLY way to read one: there is no public URL. Decrypts on request and
 * tells browsers and proxies never to cache it. Mirrors the paystub route.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await sessionWithRole('admin')
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await ctx.params
  // ?pending=1 → the lease attached to a program-change request awaiting review.
  const pending = new URL(req.url).searchParams.get('pending') === '1'
  const file = await readLeaseFile(id, pending ? 'pending' : 'current')
  if (!file) return new Response('Not found', { status: 404 })

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': file.contentType,
      // Inline so PDFs/images open in the browser tab; fixed filename (no user input).
      'Content-Disposition': `inline; filename="lease.${EXTENSION[file.contentType]}"`,
      // PII: never store in browser/CDN caches.
      'Cache-Control': 'private, no-store, max-age=0',
      // Content type was verified from the file's bytes; forbid the browser from guessing otherwise.
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
