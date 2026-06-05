import type { ReactNode } from 'react'
import { Container } from '@/components/elements/container'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { LogoutButton } from '@/components/auth/logout-button'

/** Standard authenticated portal header + content well. */
export function PortalShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="py-16">
      <Container className="flex flex-col gap-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Eyebrow>{eyebrow}</Eyebrow>
            <Subheading className="text-3xl/9 sm:text-4xl/12">{title}</Subheading>
          </div>
          <LogoutButton />
        </div>
        {children}
      </Container>
    </section>
  )
}
