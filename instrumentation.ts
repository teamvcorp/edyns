import type { Instrumentation } from 'next'

/**
 * Central server-error hook (Next.js 16 instrumentation — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
 *
 * Next calls `onRequestError` for every error it captures that our own code
 * didn't catch: Server Component renders, Server Actions, Route Handlers and the
 * Proxy. Without this, those only show up as Next's default log line; with it,
 * each one is a single structured JSON line in Vercel's runtime logs, searchable
 * by `[unhandled]`, the route, or the `digest`.
 *
 * The `digest` is the same reference shown to the user on the error page
 * (app/error.tsx), so a screenshot from a tester can be matched to the log line.
 *
 * Privacy/security:
 *  - We log the route PATTERN (`/invoices/[token]`), never the real URL — paths
 *    and query strings can carry secrets (invoice tokens, Stripe session ids).
 *  - No headers or cookies (session cookies, auth headers).
 *  - The error goes through describeError (lib/log.ts), which strips Plaid
 *    secrets and Mongo PII.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Lazy import keeps the logger out of the instrumentation bootstrap.
  const { logError } = await import('./lib/log')
  const error = err as Error & { digest?: string }
  logError('unhandled', error, {
    digest: error.digest,
    method: request.method,
    route: context.routePath,
    routeType: context.routeType, // render | route | action | proxy
    renderSource: 'renderSource' in context ? context.renderSource : undefined,
  })
}
