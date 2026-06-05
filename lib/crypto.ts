import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

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

export function encryptString(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString('base64')
}

export function decryptString(blob: string): string {
  const buf = Buffer.from(blob, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ciphertext = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
