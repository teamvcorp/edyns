import 'server-only'

/**
 * Identify an uploaded file from its first bytes ("magic numbers").
 *
 * The browser-declared MIME type and the filename are attacker-controlled, so
 * uploads must be classified by content. Used by paystubs (lib/paystubs.ts) and
 * repair photos (lib/repairs.ts). Returns null for anything not recognised.
 */
export type SniffedType = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'

export const IMAGE_TYPES: SniffedType[] = ['image/jpeg', 'image/png', 'image/webp']

export function sniffFileType(buf: Buffer): SniffedType | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp'
  }
  return null
}

export type CheckedUpload =
  | { ok: true; bytes: Buffer; contentType: SniffedType }
  | { ok: false; error: 'missing' | 'too-big' | 'bad-type' }

/**
 * Validate an uploaded document BEFORE storing anything: present, under the size
 * cap, and really a PDF/JPEG/PNG/WebP by its bytes. Lets an action reject a bad
 * file before it creates accounts or records. (Used by lib/leases.ts; paystubs
 * predate it and inline the same checks.)
 */
export async function checkUpload(file: File | null, maxBytes: number): Promise<CheckedUpload> {
  if (!file || file.size === 0) return { ok: false, error: 'missing' }
  if (file.size > maxBytes) return { ok: false, error: 'too-big' }
  const bytes = Buffer.from(await file.arrayBuffer())
  const contentType = sniffFileType(bytes)
  if (!contentType) return { ok: false, error: 'bad-type' }
  return { ok: true, bytes, contentType }
}

/** File extension for a sniffed type — used for fixed, non-user-supplied download names. */
export const EXTENSION: Record<SniffedType, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
