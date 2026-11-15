import type { ComponentProps, ComponentType } from 'react'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { ButtonLink } from '@/components/elements/button'
import { HomeIcon } from '@/components/icons/home-icon'
import { KeyIcon } from '@/components/icons/key-icon'
import { MapIcon } from '@/components/icons/map-icon'
import { CompassIcon } from '@/components/icons/compass-icon'
import { PROGRAMS, PROGRAM_IDS, rateSummary, type ProgramId } from '@/lib/programs'

// Card icon per program. A full Record, so adding a program in lib/programs.ts
// without an icon here is a compile error rather than a blank card.
const programIcons: Record<ProgramId, ComponentType<ComponentProps<'svg'>>> = {
  effort_exchange: HomeIcon,
  own_landlord: KeyIcon,
  own_landlord_car: CompassIcon,
  car_only: MapIcon,
}

/**
 * One card per tenant program (name, rate, summary, apply link). Shared by the
 * enroll chooser (app/tenants/enroll) and the public program page
 * (app/programs/tenants) so the two never drift. Content: lib/programs.ts.
 */
export function ProgramCards({ headingLevel = 'h3' }: { headingLevel?: 'h2' | 'h3' }) {
  const H = headingLevel
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {PROGRAM_IDS.map((id) => {
        const p = PROGRAMS[id]
        const Icon = programIcons[id]
        return (
          <Card key={id} className="flex flex-col items-start gap-4">
            <span className="inline-flex size-10 items-center justify-center rounded-full bg-olive-950/5 text-olive-950 dark:bg-white/10 dark:text-white">
              <Icon className="size-5" />
            </span>
            <div className="flex flex-col gap-1">
              <H className="text-lg font-semibold text-olive-950 dark:text-white">{p.label}</H>
              <p className="text-sm/6 font-medium text-olive-700 dark:text-olive-400">{rateSummary(id)} of your pay</p>
            </div>
            <Text className="text-sm/6">
              <p>{p.summary}</p>
            </Text>
            <ButtonLink href={`/tenants/enroll?program=${id}`} className="mt-auto">
              Apply for {p.short}
            </ButtonLink>
          </Card>
        )
      })}
    </div>
  )
}
