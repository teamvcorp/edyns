import { sessionWithRole } from '@/lib/dal'
import { readStatementFile } from '@/lib/statements'

/**
 * Admin-only viewer for one encrypted bank statement PDF. The ONLY way to read
 * one — there's no public URL. Scoped by tenant id + statement id, decrypted on
 * request, never cached. Mirrors the paystub/lease routes.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; statementId: string }> },
): Promise<Response> {
  const session = await sessionWithRole('admin')
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id, statementId } = await ctx.params
  const bytes = await readStatementFile(id, statementId)
  if (!bytes) return new Response('Not found', { status: 404 })

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf', // verified by magic bytes when stored
      'Content-Disposition': 'inline; filename="statement.pdf"',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
