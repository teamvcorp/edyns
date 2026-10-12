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

export const metadata: Metadata = { title: 'Tenant application' }

export default async function TenantEnrollPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string; invite?: string }>
}) {
  const { canceled, invite: inviteToken } = await searchParams

  // Validate the invite server-side. The property (if any) comes from the invite
  // record, never from the URL, and is only shown while it's still approved.
  const invite = inviteToken ? await getValidInviteByToken(inviteToken) : null
  const inviteProperty = invite?.propertyId ? await getPropertyById(invite.propertyId) : null
  const showProperty = inviteProperty?.status === 'approved' ? inviteProperty : null

  return (
    <section className="py-16 sm:py-20">
      <Container className="flex max-w-2xl flex-col">
        {/* Lighter padding on phones: Container already spends 24px per side, so p-8 here left ~248px of form width on a 360px screen. */}
        <Card className="flex flex-col gap-6 p-5 sm:p-10">
          <div className="flex flex-col gap-2">
            <Eyebrow>Tenants · The Effort Exchange</Eyebrow>
            <Subheading className="text-3xl/9">Apply to the program</Subheading>
            <Text className="text-sm/6">
              <p>Tell us about your household and employment. A $25 application fee is collected at the end.</p>
            </Text>
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
