import { sessionWithRole } from '@/lib/dal'
import { readPaystubFile } from '@/lib/paystubs'
import { EXTENSION } from '@/lib/files'

/**
 * Admin-only viewer for a tenant's encrypted paystub. This is the ONLY way to
 * read one: there is no public URL. Decrypts on request and tells browsers and
 * proxies never to cache it.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await sessionWithRole('admin')
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await ctx.params
  const file = await readPaystubFile(id)
  if (!file) return new Response('Not found', { status: 404 })

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': file.contentType,
      // Inline so PDFs/images open in the browser tab; fixed filename (no user input).
      'Content-Disposition': `inline; filename="paystub.${EXTENSION[file.contentType]}"`,
      // PII: never store in browser/CDN caches.
      'Cache-Control': 'private, no-store, max-age=0',
      // Content type was verified from the file's bytes; forbid the browser from guessing otherwise.
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
