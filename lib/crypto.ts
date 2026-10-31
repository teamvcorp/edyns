import 'server-only'

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * AES-256-GCM encryption for sensitive fields at rest (e.g. tax IDs, and later
 * Plaid access tokens). Uses EE_ENCRYPTION_KEY (64 hex chars = 32 bytes).
 *
 * Output format (base64): iv(12) | authTag(16) | ciphertext.
 * The key is read lazily so `next build` doesn't require it at import time.
 */

function getKey(): Buffer {
  const keyHex = process.env.EE_ENCRYPTION_KEY
  if (!keyHex) throw new Error('Missing EE_ENCRYPTION_KEY environment variable')
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('EE_ENCRYPTION_KEY must be 32 bytes (64 hex characters)')
  return key
}

/** Encrypt raw bytes (e.g. an uploaded document). Output: iv(12) | authTag(16) | ciphertext. */
export function encryptBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
}

/** Decrypt bytes from `encryptBuffer`. Throws if the data was tampered with (GCM auth tag). */
export function decryptBuffer(buf: Buffer): Buffer {
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ciphertext = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export function encryptString(plain: string): string {
  return encryptBuffer(Buffer.from(plain, 'utf8')).toString('base64')
}

export function decryptString(blob: string): string {
  return decryptBuffer(Buffer.from(blob, 'base64')).toString('utf8')
}

/**
 * Constant-time string comparison for secrets (passwords, bearer tokens).
 * A plain `a === b` returns as soon as a character differs, so response timing
 * can leak how much of a guess was right. Hashing both sides first gives equal-
 * length buffers, which `timingSafeEqual` requires, without leaking the length.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}
