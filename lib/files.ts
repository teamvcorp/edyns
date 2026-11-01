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

/** File extension for a sniffed type — used for fixed, non-user-supplied download names. */
export const EXTENSION: Record<SniffedType, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
