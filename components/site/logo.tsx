import Link from 'next/link'
import { clsx } from 'clsx/lite'
import type { ComponentProps } from 'react'

/** edynsgate wordmark, set in the display serif. */
export function Logo({ className, href = '/', ...props }: { href?: string } & Omit<ComponentProps<'a'>, 'href'>) {
  return (
    <Link
      href={href}
      className={clsx(
        'font-display text-2xl tracking-tight text-olive-950 lowercase dark:text-white',
        className,
      )}
      {...props}
    >
      edynsgate
    </Link>
  )
}
