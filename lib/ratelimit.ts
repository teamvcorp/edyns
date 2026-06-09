import 'server-only'

import { headers } from 'next/headers'
import { getDb } from './mongodb'

/**
 * Mongo-backed fixed-window rate limiter. A counter document keyed by
 * `${key}:${windowStart}` is incremented per hit; a TTL index expires old
 * windows automatically so the collection stays small. Good enough for sign-up
 * / login velocity controls without needing Redis.
 */
interface RateDoc {
  _id: string
  count: number
  expiresAt: Date
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
}

export async function rateLimit(opts: { key: string; limit: number; windowMs: number }): Promise<RateLimitResult> {
  try {
    const db = await getDb()
    const col = db.collection<RateDoc>('rateLimits')
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

    const now = Date.now()
    const windowStart = Math.floor(now / opts.windowMs) * opts.windowMs
    const _id = `${opts.key}:${windowStart}`

    const doc = await col.findOneAndUpdate(
      { _id },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + opts.windowMs) } },
      { upsert: true, returnDocument: 'after' },
    )
    const count = doc?.count ?? 1
    return { allowed: count <= opts.limit, remaining: Math.max(0, opts.limit - count) }
  } catch {
    // Fail open: a rate-limit backend hiccup must not lock out all users.
    return { allowed: true, remaining: 0 }
  }
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export async function getClientIp(): Promise<string> {
  const h = await headers()
  const xff = h.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return h.get('x-real-ip') ?? 'unknown'
}
