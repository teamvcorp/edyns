import { Button } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { InformationCircleIcon } from '@/components/icons/information-circle-icon'
import { TIERS } from '@/lib/tiers'

const inputClass =
  'rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:placeholder:text-olive-400'

/** GET form so filters live in the URL (works with the dynamic /properties page). */
export function PropertyFilters({ zip, tier }: { zip?: string; tier?: string }) {
  const hasFilters = Boolean(zip || tier)

  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
        Zip code
        <input
          name="zip"
          defaultValue={zip}
          inputMode="numeric"
          placeholder="e.g. 50588"
          className={`${inputClass} w-36`}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
        <span className="flex items-center gap-1.5">
          Tier
          {/* Tooltip: hover or focus the info icon to see what each tier means. */}
          <span tabIndex={0} className="group relative inline-flex cursor-help text-olive-500 outline-none">
            <InformationCircleIcon className="size-4" />
            <span className="pointer-events-none absolute left-0 top-6 z-10 hidden w-60 flex-col gap-1 rounded-lg bg-olive-950 p-3 text-xs font-normal text-white shadow-lg group-hover:flex group-focus:flex dark:bg-olive-800">
              {TIERS.map((t) => (
                <span key={t.value}>
                  <strong className="font-semibold">Tier {t.value}</strong> · {t.label}
                </span>
              ))}
            </span>
          </span>
        </span>
        <select name="tier" defaultValue={tier ?? ''} className={inputClass}>
          <option value="">All tiers</option>
          {TIERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.value} · {t.label}
            </option>
          ))}
        </select>
      </label>

      <Button type="submit">Apply</Button>
      {hasFilters && (
        <Link href="/properties" className="pb-2">
          Clear
        </Link>
      )}
    </form>
  )
}
