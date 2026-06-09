import { clsx } from 'clsx/lite'
import { Fragment } from 'react'

export type Crumb = { label: string; href?: string }

/**
 * Breadcrumb trail for nested portal pages. The last crumb is the current page
 * (rendered as plain text); earlier crumbs link back up the hierarchy.
 */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm/6 text-olive-600 dark:text-olive-500">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <Fragment key={`${item.label}-${i}`}>
              <li>
                {item.href && !isLast ? (
                  <a
                    href={item.href}
                    className="font-medium text-olive-700 hover:text-olive-950 dark:text-olive-400 dark:hover:text-white"
                  >
                    {item.label}
                  </a>
                ) : (
                  <span className={clsx(isLast && 'text-olive-950 dark:text-white')} aria-current={isLast ? 'page' : undefined}>
                    {item.label}
                  </span>
                )}
              </li>
              {!isLast && (
                <li aria-hidden="true" className="text-olive-400 dark:text-olive-600">
                  /
                </li>
              )}
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
