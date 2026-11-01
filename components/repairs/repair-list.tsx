import { Link } from '@/components/elements/link'
import { SoftButton } from '@/components/elements/button'
import { cancelRepairRequest } from '@/app/actions/repairs'
import { CATEGORY_LABEL, STATUS_LABEL, type RepairRequest, type RepairStatus, type RepairUrgency } from '@/lib/repairs'

const statusTone: Record<RepairStatus, string> = {
  open: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  scheduled: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
  in_progress: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
  completed: 'bg-green-500/15 text-green-800 dark:text-green-300',
  canceled: 'bg-olive-950/10 text-olive-700 dark:bg-white/10 dark:text-olive-300',
}

const urgencyLabel: Record<RepairUrgency, string> = { emergency: 'Emergency', urgent: 'Urgent', routine: 'Routine' }

/**
 * Repair requests as cards. Used by the partner, tenant and admin pages.
 * - `addresses`: propertyId → display address (caller already loaded the properties).
 * - `viewerId`: shows "Cancel" on the viewer's own still-open requests.
 * - `adminLinks`: link each request to its admin detail page.
 * Photos load through the auth-checked route, never a public URL.
 */
export function RepairList({
  repairs,
  addresses,
  viewerId,
  adminLinks = false,
}: {
  repairs: RepairRequest[]
  addresses: Record<string, string>
  viewerId?: string
  adminLinks?: boolean
}) {
  if (repairs.length === 0) {
    return <p className="text-sm text-olive-600 dark:text-olive-500">No repair requests yet.</p>
  }

  return (
    <ul className="flex flex-col divide-y divide-olive-950/10 dark:divide-white/10">
      {repairs.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone[r.status]}`}>
              {STATUS_LABEL[r.status]}
            </span>
            {r.urgency !== 'routine' && (
              <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-400">
                {urgencyLabel[r.urgency]}
              </span>
            )}
            <span className="text-xs text-olive-600 dark:text-olive-500">
              {CATEGORY_LABEL[r.category]} · {r.createdAt.toLocaleDateString()} · from the{' '}
              {r.requesterRole === 'tenant' ? 'tenant' : 'owner'}
            </span>
          </div>

          <div className="flex flex-col">
            {adminLinks ? (
              <Link href={`/admin/repairs/${r.id}`} className="font-semibold">
                {r.title}
              </Link>
            ) : (
              <span className="font-semibold text-olive-950 dark:text-white">{r.title}</span>
            )}
            <span className="text-sm text-olive-600 dark:text-olive-500">{addresses[r.propertyId] ?? 'Property'}</span>
          </div>

          {!adminLinks && (
            <p className="text-sm whitespace-pre-wrap text-olive-700 dark:text-olive-300">{r.description}</p>
          )}

          {r.photoCount > 0 && (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: r.photoCount }, (_, i) => (
                <a key={i} href={`/api/repairs/${r.id}/photos/${i}`} target="_blank" rel="noopener noreferrer">
                  {/* Plain <img>: next/image would cache this private photo in the optimizer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/repairs/${r.id}/photos/${i}`}
                    alt={`Repair photo ${i + 1}`}
                    className="size-20 rounded-lg object-cover ring-1 ring-olive-950/10 dark:ring-white/10"
                  />
                </a>
              ))}
            </div>
          )}

          {r.adminNote && (
            <p className="rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-800 dark:bg-white/5 dark:text-olive-200">
              <span className="font-semibold">Note from our team:</span> {r.adminNote}
            </p>
          )}

          {viewerId && r.requesterUserId === viewerId && r.status === 'open' && (
            <form action={cancelRepairRequest}>
              <input type="hidden" name="id" value={r.id} />
              <SoftButton type="submit" className="w-fit">
                Cancel request
              </SoftButton>
            </form>
          )}
        </li>
      ))}
    </ul>
  )
}
