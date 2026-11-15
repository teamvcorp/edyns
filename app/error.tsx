'use client' // Error boundaries must be Client Components

import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Button, PlainButtonLink } from '@/components/elements/button'
import { useErrorReport } from '@/components/site/error-report'

/**
 * Page-level error boundary (Next.js 16: `unstable_retry` re-fetches and
 * re-renders the segment). Shows the error `digest` as a reference so a user's
 * screenshot can be matched to the `[unhandled]` server log line
 * (instrumentation.ts). Server error details are never shown — Next replaces
 * them with a generic message in production.
 */
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useErrorReport(error, 'page')

  return (
    <section className="py-16 sm:py-24">
      <Container className="flex max-w-xl flex-col">
        <Card className="flex flex-col items-start gap-4">
          <Subheading className="text-3xl/9">Something went wrong</Subheading>
          <Text className="text-sm/6">
            <p>We’ve logged the problem. Please try again — if it keeps happening, contact us and share the reference below.</p>
          </Text>
          {error.digest && (
            <p className="text-xs text-olive-600 dark:text-olive-500">
              Reference: <code className="text-olive-950 dark:text-white">{error.digest}</code>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => unstable_retry()}>
              Try again
            </Button>
            <PlainButtonLink href="/">Go home</PlainButtonLink>
          </div>
        </Card>
      </Container>
    </section>
  )
}
