import { clsx } from 'clsx/lite'
import type { ComponentProps } from 'react'

export function Card({ children, className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={clsx(
        'rounded-2xl bg-white p-8 ring-1 ring-olive-950/5 dark:bg-olive-900 dark:ring-white/10',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
