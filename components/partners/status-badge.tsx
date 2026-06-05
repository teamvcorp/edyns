import { clsx } from 'clsx/lite'
import type { PropertyStatus } from '@/lib/properties'

const styles: Record<PropertyStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  approved: 'bg-olive-600/15 text-olive-700 dark:text-olive-300',
  rejected: 'bg-red-500/15 text-red-700 dark:text-red-400',
}

const labels: Record<PropertyStatus, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
}

export function StatusBadge({ status }: { status: PropertyStatus }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', styles[status])}>
      {labels[status]}
    </span>
  )
}
