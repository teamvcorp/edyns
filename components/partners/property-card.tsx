import Image from 'next/image'
import { Card } from '@/components/elements/card'
import { PlainButton } from '@/components/elements/button'
import { StatusBadge } from './status-badge'
import { deleteProperty } from '@/app/actions/properties'
import { formatCurrency, formatNumber, formatAddress } from '@/lib/format'
import type { Property } from '@/lib/properties'

export function PropertyCard({ property }: { property: Property }) {
  const canDelete = property.status === 'pending'

  return (
    <Card className="flex flex-col gap-4 p-0 ring-1">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-2xl bg-olive-950/5 dark:bg-white/5">
        {property.thumbnailUrl ? (
          <Image src={property.thumbnailUrl} alt="" fill sizes="(min-width:1024px) 33vw, 100vw" className="object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-olive-500">No photo</div>
        )}
        <div className="absolute left-3 top-3">
          <StatusBadge status={property.status} />
        </div>
      </div>

      <div className="flex flex-col gap-4 p-6 pt-2">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium text-olive-950 dark:text-white">{property.address.line1}</h3>
          <p className="text-sm text-olive-600 dark:text-olive-500">{formatAddress(property.address)}</p>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-sm">
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
        </dl>

        <dl className="grid grid-cols-2 gap-2 border-t border-olive-950/10 pt-4 text-sm dark:border-white/10">
          <div>
            <dt className="text-olive-600 dark:text-olive-500">Assessed</dt>
            <dd className="text-olive-950 dark:text-white">{formatCurrency(property.assessedValue)}</dd>
          </div>
          <div>
            <dt className="text-olive-600 dark:text-olive-500">Asking</dt>
            <dd className="text-olive-950 dark:text-white">{formatCurrency(property.askingPrice)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-olive-600 dark:text-olive-500">Equity generated</dt>
            <dd className="text-olive-950 dark:text-white">
              {property.status === 'approved'
                ? formatCurrency(property.equityGenerated)
                : 'Set after approval'}
            </dd>
          </div>
        </dl>

        {property.status === 'rejected' && property.rejectionReason && (
          <p className="text-sm text-red-600 dark:text-red-400">Reason: {property.rejectionReason}</p>
        )}

        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-olive-500">{property.galleryUrls.length} gallery photo(s)</span>
          {canDelete ? (
            <form action={deleteProperty}>
              <input type="hidden" name="id" value={property.id} />
              <PlainButton type="submit" className="text-red-600 hover:bg-red-500/10 dark:text-red-400">
                Delete
              </PlainButton>
            </form>
          ) : (
            <span className="text-xs text-olive-500">Locked (equity involved)</span>
          )}
        </div>
      </div>
    </Card>
  )
}
