import Image from 'next/image'
import Link from 'next/link'
import { Card } from '@/components/elements/card'
import { formatNumber, formatCurrency } from '@/lib/format'
import { tierLabel } from '@/lib/tiers'
import type { Property } from '@/lib/properties'

/** Tenant-facing listing card — no partner/admin financials (assessed, asking, equity). */
export function PublicPropertyCard({ property }: { property: Property }) {
  return (
    <Link href={`/properties/${property.id}`} className="group">
      <Card className="flex h-full flex-col gap-4 p-0 ring-1 transition group-hover:ring-olive-950/20 dark:group-hover:ring-white/20">
        <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl bg-olive-950/5 dark:bg-white/5">
          {property.thumbnailUrl ? (
            <Image src={property.thumbnailUrl} alt="" fill sizes="(min-width:1024px) 33vw, 100vw" className="object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-sm text-olive-500">No photo</div>
          )}
          <div className="absolute left-3 top-3 rounded-full bg-olive-950/80 px-2.5 py-0.5 text-xs font-semibold text-white">
            Tier {property.tier ?? 0} · {tierLabel(property.tier)}
          </div>
        </div>
        <div className="flex flex-col gap-3 p-6 pt-2">
          <div className="flex flex-col">
            <h3 className="font-medium text-olive-950 dark:text-white">
              {property.address.city}, {property.address.state}
            </h3>
            <p className="text-sm text-olive-600 dark:text-olive-500">
              {formatNumber(property.bedrooms)} rooms · {formatNumber(property.bathrooms)} baths ·{' '}
              {formatNumber(property.squareFeet)} sq ft
            </p>
          </div>
          <p className="text-sm text-olive-700 dark:text-olive-400">
            Income to qualify: <span className="font-semibold">{formatCurrency(property.incomeRequirement)}/mo</span>
          </p>
        </div>
      </Card>
    </Link>
  )
}
