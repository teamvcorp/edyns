import { rateLimit, getClientIp } from '@/lib/ratelimit'
import { logWarn } from '@/lib/log'

/**
 * Browser error reports → server logs, so crashes that happen in a tester's
 * browser (client components, failed hydration) show up in Vercel's runtime
 * logs next to server errors. Called by components/site/error-report.tsx from
 * the error pages.
 *
 * Public endpoint, so it's defensive:
 *  - rate-limited per IP (no log flooding);
 *  - accepts only a few short string fields, truncated — never the full URL
 *    (query strings can hold secrets), never cookies or user data;
 *  - always answers 204 so it can't be used to probe anything.
 */

const LIMIT = 20
const WINDOW_MS = 10 * 60 * 1000
const MAX = 300

const clip = (v: unknown, max = MAX) => (typeof v === 'string' ? v.slice(0, max) : undefined)

export async function POST(request: Request): Promise<Response> {
  const ip = await getClientIp()
  const { allowed } = await rateLimit({ key: `client-error:${ip}`, limit: LIMIT, windowMs: WINDOW_MS })
  if (!allowed) return new Response(null, { status: 204 })

  let body: Record<string, unknown> = {}
  try {
    // Small payloads only; anything unparseable is just ignored.
    const text = await request.text()
    if (text.length <= 4000) body = JSON.parse(text)
  } catch {
    logWarn('client-error', 'unparseable report')
    return new Response(null, { status: 204 })
  }

  logWarn('client-error', clip(body.message) ?? 'unknown browser error', {
    digest: clip(body.digest, 100),
    name: clip(body.name, 100),
    // Pathname only (the reporter strips the query string), clipped.
    path: clip(body.path, 200),
    boundary: clip(body.boundary, 20),
  })
  return new Response(null, { status: 204 })
}
