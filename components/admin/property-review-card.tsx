'use client'

import { useActionState } from 'react'
import Image from 'next/image'
import { Card } from '@/components/elements/card'
import { Button, SoftButton } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { StatusBadge } from '@/components/partners/status-badge'
import { approvePropertyAction, rejectPropertyAction, type AdminActionState } from '@/app/actions/admin'
import { formatCurrency, formatNumber, formatAddress } from '@/lib/format'
import { TIERS } from '@/lib/tiers'
import type { Property } from '@/lib/properties'

const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10'

export function PropertyReviewCard({ property }: { property: Property }) {
  const [approveState, approveAction, approving] = useActionState<AdminActionState, FormData>(
    approvePropertyAction,
    undefined,
  )
  const [rejectState, rejectAction, rejecting] = useActionState<AdminActionState, FormData>(
    rejectPropertyAction,
    undefined,
  )

  const suggestedEquity = Math.round(property.askingPrice * 0.1)

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium text-olive-950 dark:text-white">{formatAddress(property.address)}</h3>
          <p className="text-xs text-olive-500">Partner: {property.partnerId}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/admin/properties/${property.id}`} className="text-sm">
            Edit
          </Link>
          <StatusBadge status={property.status} />
        </div>
      </div>

      {property.thumbnailUrl && (
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-olive-950/5 dark:bg-white/5">
          <Image src={property.thumbnailUrl} alt="" fill sizes="(min-width:1024px) 50vw, 100vw" className="object-cover" />
        </div>
      )}

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-olive-600 dark:text-olive-500">Rooms</dt>
          <dd className="text-olive-950 dark:text-white">{formatNumber(property.bedrooms)}</dd>
        </div>
        <div>
          <dt className="text-olive-600 dark:text-olive-500">Baths</dt>
          <dd className="text-olive-950 dark:text-white">{formatNumber(property.bathrooms)}</dd>
        </div>
        <div>
          <dt className="text-olive-600 dark:text-olive-500">Sq ft</dt>
          <dd className="text-olive-950 dark:text-white">{formatNumber(property.squareFeet)}</dd>
        </div>
        <div>
          <dt className="text-olive-600 dark:text-olive-500">Lot</dt>
          <dd className="text-olive-950 dark:text-white">{property.lotSize}</dd>
        </div>
        <div>
          <dt className="text-olive-600 dark:text-olive-500">Assessed</dt>
          <dd className="text-olive-950 dark:text-white">{formatCurrency(property.assessedValue)}</dd>
        </div>
        <div>
          <dt className="text-olive-600 dark:text-olive-500">Asking</dt>
          <dd className="text-olive-950 dark:text-white">{formatCurrency(property.askingPrice)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-olive-600 dark:text-olive-500">Gallery</dt>
          <dd className="text-olive-950 dark:text-white">{property.galleryUrls.length} photo(s)</dd>
        </div>
      </dl>

      {property.status === 'approved' && (
        <p className="text-sm text-olive-700 dark:text-olive-300">
          Equity generated: <span className="font-semibold">{formatCurrency(property.equityGenerated)}</span>
        </p>
      )}
      {property.status === 'rejected' && (
        <p className="text-sm text-red-600 dark:text-red-400">Rejected: {property.rejectionReason}</p>
      )}

      {property.status === 'pending' && (
        <div className="flex flex-col gap-4 border-t border-olive-950/10 pt-4 dark:border-white/10">
          <form action={approveAction} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={property.id} />
            <label className="text-sm font-medium text-olive-950 dark:text-white">
              Equity to generate (USD)
              <input
                type="number"
                name="equityGenerated"
                inputMode="numeric"
                defaultValue={suggestedEquity || ''}
                placeholder="Suggested: 10% of asking"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-olive-950 dark:text-white">
                Housing tier
                <select name="tier" defaultValue="" className={`mt-1 ${inputClass}`}>
                  <option value="" disabled>
                    Select tier…
                  </option>
                  {TIERS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.value} · {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-olive-950 dark:text-white">
                Income req. (USD/mo)
                <input type="number" name="incomeRequirement" inputMode="numeric" placeholder="e.g. 2500" className={`mt-1 ${inputClass}`} />
              </label>
            </div>
            <label className="text-sm font-medium text-olive-950 dark:text-white">
              Partner equity share (% of rent)
              <input
                type="number"
                name="equitySharePercent"
                inputMode="numeric"
                min={0}
                max={100}
                step="0.1"
                defaultValue={10}
                placeholder="e.g. 10"
                className={`mt-1 ${inputClass}`}
              />
              <span className="mt-1 block text-xs font-normal text-olive-600 dark:text-olive-500">
                Percent of each rent payment credited to the partner as equity.
              </span>
            </label>
            {approveState?.error && (
              <span role="alert" className="text-xs text-red-600 dark:text-red-400">
                {approveState.error}
              </span>
            )}
            <Button type="submit" disabled={approving} className="w-fit disabled:opacity-60">
              {approving ? 'Approving…' : 'Approve'}
            </Button>
          </form>

          <form action={rejectAction} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={property.id} />
            <input name="reason" placeholder="Reason for rejection (optional)" className={inputClass} />
            {rejectState?.error && (
              <span role="alert" className="text-xs text-red-600 dark:text-red-400">
                {rejectState.error}
              </span>
            )}
            <SoftButton type="submit" disabled={rejecting} className="w-fit disabled:opacity-60">
              {rejecting ? 'Rejecting…' : 'Reject'}
            </SoftButton>
          </form>
        </div>
      )}
    </Card>
  )
}
