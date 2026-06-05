import type { ReactNode } from 'react'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'

/** Centered card used by every login page. */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section className="py-20 sm:py-28">
      <Container className="flex max-w-md flex-col">
        <Card className="flex flex-col gap-6 p-8 sm:p-10">
          <div className="flex flex-col gap-2">
            <Eyebrow>{eyebrow}</Eyebrow>
            <Subheading className="text-3xl/9">{title}</Subheading>
            {subtitle && (
              <Text className="text-sm/6">
                <p>{subtitle}</p>
              </Text>
            )}
          </div>
          {children}
          {footer && <div className="text-sm text-olive-700 dark:text-olive-400">{footer}</div>}
        </Card>
      </Container>
    </section>
  )
}
