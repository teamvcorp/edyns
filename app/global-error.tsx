'use client' // Error boundaries must be Client Components

import { useErrorReport } from '@/components/site/error-report'

/**
 * Last-resort boundary for errors in the root layout itself. It REPLACES the
 * root layout, so it renders its own <html>/<body> and uses inline styles (the
 * app's CSS and fonts may not be loaded). Reports the error like app/error.tsx.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useErrorReport(error, 'global')

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#f1efe7', color: '#21201a', margin: 0 }}>
        <title>Something went wrong · edynsgate</title>
        <main style={{ maxWidth: 520, margin: '15vh auto', padding: '0 16px' }}>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ lineHeight: 1.6 }}>
            We’ve logged the problem. Please try again — if it keeps happening, contact us and share the reference below.
          </p>
          {error.digest && (
            <p style={{ fontSize: 13, color: '#6b6b60' }}>
              Reference: <code>{error.digest}</code>
            </p>
          )}
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{ background: '#26301b', color: '#fff', border: 0, borderRadius: 9999, padding: '10px 18px', cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
