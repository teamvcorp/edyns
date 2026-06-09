import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getPropertyById } from '@/lib/properties'
import { getSession } from '@/lib/session'
import { getTenantByUserId } from '@/lib/tenants'
import { listRequestsByTenant, type MoveInStatus } from '@/lib/moveins'
import { Container } from '@/components/elements/container'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Card } from '@/components/elements/card'
import { Link } from '@/components/elements/link'
import { ButtonLink } from '@/components/elements/button'
import { MoveInButton } from '@/components/properties/move-in-button'
import { formatNumber, formatCurrency, formatAddress } from '@/lib/format'
import { tierLabel } from '@/lib/tiers'

export const metadata: Metadata = { title: 'Property' }

const requestStatusCopy: Record<MoveInStatus, string> = {
  requested: 'You’ve requested to move into this home. It’s pending review.',
  approved: 'Your move-in request for this home was approved!',
  declined: 'Your move-in request for this home was declined.',
  reversed: 'Your move-in request for this home was reversed.',
  evicted: 'Your tenancy at this home has ended.',
}

async function MoveInCta({ propertyId, incomeRequirement }: { propertyId: string; incomeRequirement: number }) {
  const session = await getSession()

  if (session?.role !== 'tenant') {
    return (
      <div className="flex flex-col gap-3">
        <Text className="text-sm/6">
          <p>Approved tenants can request to move in. Apply to the Effort Exchange to get started.</p>
        </Text>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/tenants/enroll">Apply as a tenant</ButtonLink>
          <ButtonLink href="/tenants/login" color="light">
            Tenant sign in
          </ButtonLink>
        </div>
      </div>
    )
  }

  const tenant = await getTenantByUserId(session.sub)
  if (!tenant) return <Text className="text-sm/6"><p>Complete your tenant application to move in.</p></Text>

  if (tenant.status !== 'approved') {
    return (
      <Text className="text-sm/6">
        <p>Your application is {tenant.status}. Once approved, you can request to move into homes you qualify for.</p>
      </Text>
    )
  }

  const requests = await listRequestsByTenant(tenant.id)
  const inactive: MoveInStatus[] = ['declined', 'reversed', 'evicted']
  const existing = requests.find((r) => r.propertyId === propertyId && !inactive.includes(r.status))
  if (existing) {
    return <Text className="text-sm/6"><p>{requestStatusCopy[existing.status]}</p></Text>
  }

  if (tenant.employment.monthlyIncome < incomeRequirement) {
    return (
      <Text className="text-sm/6">
        <p>
          This tier requires <strong>{formatCurrency(incomeRequirement)}/mo</strong> income. Your income on file is{' '}
          {formatCurrency(tenant.employment.monthlyIncome)}/mo.
        </p>
      </Text>
    )
  }

  return <MoveInButton propertyId={propertyId} />
}

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const property = await getPropertyById(id)
  if (!property || property.status !== 'approved') notFound()

  const mapsHref = property.coordinates
    ? `https://www.google.com/maps/search/?api=1&query=${property.coordinates.lat},${property.coordinates.lng}`
    : null

  return (
    <section className="py-16">
      <Container className="flex flex-col gap-10">
        <div className="flex flex-col gap-2">
          <Link href="/properties">← Back to all properties</Link>
          <Eyebrow>
            Tier {property.tier ?? 0} · {tierLabel(property.tier)}
          </Eyebrow>
          <Subheading>
            {property.address.city}, {property.address.state}
          </Subheading>
        </div>

        {/* Gallery */}
        {(property.thumbnailUrl || property.galleryUrls.length > 0) && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[property.thumbnailUrl, ...property.galleryUrls].filter(Boolean).map((url, i) => (
              <div key={i} className="relative aspect-video overflow-hidden rounded-xl bg-olive-950/5 dark:bg-white/5">
                <Image src={url as string} alt="" fill sizes="(min-width:1024px) 33vw, 100vw" className="object-cover" />
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Details */}
          <div className="lg:col-span-2">
            <Card className="flex flex-col gap-6">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <dt className="text-sm text-olive-600 dark:text-olive-500">Rooms</dt>
                  <dd className="text-olive-950 dark:text-white">{formatNumber(property.bedrooms)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-olive-600 dark:text-olive-500">Bathrooms</dt>
                  <dd className="text-olive-950 dark:text-white">{formatNumber(property.bathrooms)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-olive-600 dark:text-olive-500">Square feet</dt>
                  <dd className="text-olive-950 dark:text-white">{formatNumber(property.squareFeet)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-olive-600 dark:text-olive-500">Lot size</dt>
                  <dd className="text-olive-950 dark:text-white">{property.lotSize}</dd>
                </div>
              </dl>
              <div>
                <dt className="text-sm text-olive-600 dark:text-olive-500">Address</dt>
                <dd className="text-olive-950 dark:text-white">{formatAddress(property.address)}</dd>
                {mapsHref && (
                  <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-olive-700 underline dark:text-olive-300">
                    View on map
                  </a>
                )}
              </div>
            </Card>
          </div>

          {/* Move-in panel */}
          <Card className="flex h-fit flex-col gap-4">
            <div>
              <p className="text-sm text-olive-600 dark:text-olive-500">Income to qualify</p>
              <p className="font-display text-3xl text-olive-950 dark:text-white">
                {formatCurrency(property.incomeRequirement)}/mo
              </p>
            </div>
            <MoveInCta propertyId={property.id} incomeRequirement={property.incomeRequirement ?? 0} />
          </Card>
        </div>
      </Container>
    </section>
  )
}
