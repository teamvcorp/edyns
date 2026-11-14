import type { Metadata } from 'next'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Link } from '@/components/elements/link'
import { TenantEnrollForm } from '@/components/auth/tenant-enroll-form'
import { getValidInviteByToken } from '@/lib/invites'
import { getPropertyById } from '@/lib/properties'
import { formatAddress } from '@/lib/format'
import { tierLabel } from '@/lib/tiers'
import { ButtonLink } from '@/components/elements/button'
import { HomeIcon } from '@/components/icons/home-icon'
import { KeyIcon } from '@/components/icons/key-icon'
import { BanknotesIcon } from '@/components/icons/banknotes-icon'
import { PROGRAMS, PROGRAM_IDS, isProgramId, rateSummary, type ProgramId } from '@/lib/programs'
import { REQUIRED_WEEKLY_HOURS } from '@/lib/stripe'
import type { ComponentProps, ComponentType } from 'react'

export const metadata: Metadata = { title: 'Tenant application' }

// Card icon per program. A full Record so adding a program without an icon is a type error.
const programIcons: Record<ProgramId, ComponentType<ComponentProps<'svg'>>> = {
  effort_exchange: HomeIcon,
  own_landlord: KeyIcon,
  car_only: BanknotesIcon,
}

export default async function TenantEnrollPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string; invite?: string; program?: string }>
}) {
  const { canceled, invite: inviteToken, program: programParam } = await searchParams

  // Validate the invite server-side. The property (if any) comes from the invite
  // record, never from the URL, and is only shown while it's still approved.
  const invite = inviteToken ? await getValidInviteByToken(inviteToken) : null
  const inviteProperty = invite?.propertyId ? await getPropertyById(invite.propertyId) : null
  const showProperty = inviteProperty?.status === 'approved' ? inviteProperty : null

  // Invites are always for a home we manage → Effort Exchange. Otherwise the
  // program comes from ?program= (validated; the action re-validates too).
  // No valid program yet → show the chooser instead of the form.
  const program: ProgramId | null = invite ? 'effort_exchange' : isProgramId(programParam) ? programParam : null

  if (!program) {
    return (
      <section className="py-16 sm:py-20">
        <Container className="flex flex-col gap-10">
          <div className="flex max-w-2xl flex-col gap-3">
            <Eyebrow>Tenants · Apply</Eyebrow>
            <Subheading className="text-3xl/9">Choose your program</Subheading>
            <Text className="text-sm/6">
              <p>
                Every program asks for {REQUIRED_WEEKLY_HOURS} hours of work a week and verifies your identity and income.
                A $25 application fee is collected at the end.
              </p>
            </Text>
            {canceled && (
              <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
                Payment was canceled. Your application is saved — you can pay the fee any time from your portal.
              </p>
            )}
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {PROGRAM_IDS.map((id) => {
              const p = PROGRAMS[id]
              const Icon = programIcons[id]
              return (
                <Card key={id} className="flex flex-col items-start gap-4">
                  <span className="inline-flex size-10 items-center justify-center rounded-full bg-olive-950/5 text-olive-950 dark:bg-white/10 dark:text-white">
                    <Icon className="size-5" />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-semibold text-olive-950 dark:text-white">{p.label}</h2>
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
          <div className="text-sm text-olive-700 dark:text-olive-400">
            Already applied? <Link href="/tenants/login">Sign in</Link>
          </div>
        </Container>
      </section>
    )
  }

  const def = PROGRAMS[program]

  return (
    <section className="py-16 sm:py-20">
      <Container className="flex max-w-2xl flex-col">
        {/* Lighter padding on phones: Container already spends 24px per side, so p-8 here left ~248px of form width on a 360px screen. */}
        <Card className="flex flex-col gap-6 p-5 sm:p-10">
          <div className="flex flex-col gap-2">
            <Eyebrow>Tenants · {def.label}</Eyebrow>
            <Subheading className="text-3xl/9">Apply to the program</Subheading>
            <Text className="text-sm/6">
              <p>
                {def.summary} Tell us about your household and employment. A $25 application fee is collected at the
                end.
              </p>
            </Text>
            {!invite && (
              <Link href="/tenants/enroll" className="w-fit text-sm">
                Choose a different program
              </Link>
            )}
          </div>

          {inviteToken && !invite && (
            <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
              This invitation link has expired or was already used. You can still apply below, or ask us for a new invite.
            </p>
          )}

          {showProperty && (
            <div className="rounded-xl bg-olive-950/5 px-4 py-3 text-sm dark:bg-white/5">
              <p className="font-medium text-olive-950 dark:text-white">
                You’re applying with interest in {formatAddress(showProperty.address)}
              </p>
              <p className="text-olive-600 dark:text-olive-500">
                Tier {showProperty.tier ?? 0} · {tierLabel(showProperty.tier)}. We’ve noted your interest — you can request
                to move in once your application is approved.{' '}
                <Link href={`/properties/${showProperty.id}`}>View this home</Link>
              </p>
            </div>
          )}

          {canceled && (
            <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
              Payment was canceled. Your application is saved — you can pay the fee any time from your portal.
            </p>
          )}

          <TenantEnrollForm
            program={program}
            invite={invite && inviteToken ? { token: inviteToken, name: invite.name, email: invite.email } : undefined}
          />

          <div className="text-sm text-olive-700 dark:text-olive-400">
            Already applied? <Link href="/tenants/login">Sign in</Link>
          </div>
        </Card>
      </Container>
    </section>
  )
}
