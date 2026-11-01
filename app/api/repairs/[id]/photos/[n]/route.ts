import { sessionWithRole } from '@/lib/dal'
import { getRepairById, canViewRepair, readRepairPhoto } from '@/lib/repairs'
import { EXTENSION } from '@/lib/files'
import { logError } from '@/lib/log'

/**
 * Serves one encrypted repair photo. Allowed: admin, the requester, or the
 * partner who currently owns the property (lib/repairs.ts canViewRepair).
 * Anyone else gets 404 — same as a missing photo — so ids can't be probed.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; n: string }> }): Promise<Response> {
  const session = await sessionWithRole('admin', 'partner', 'tenant')
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id, n } = await ctx.params
  const repair = await getRepairById(id)
  if (!repair || !(await canViewRepair(session, repair))) return new Response('Not found', { status: 404 })

  let photo
  try {
    photo = await readRepairPhoto(id, Number(n))
  } catch (err) {
    // Decryption failure = tampered data or a rotated key.
    logError('repairs/photo-read', err, { repairId: id })
    return new Response('Unavailable', { status: 500 })
  }
  if (!photo) return new Response('Not found', { status: 404 })

  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      'Content-Type': photo.contentType,
      'Content-Disposition': `inline; filename="repair-photo.${EXTENSION[photo.contentType]}"`,
      // Photos of people's homes: never cache in shared/browser caches.
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
