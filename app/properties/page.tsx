import type { Metadata } from 'next'
import { listApprovedProperties } from '@/lib/properties'
import { Container } from '@/components/elements/container'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Heading } from '@/components/elements/heading'
import { Text } from '@/components/elements/text'
import { Card } from '@/components/elements/card'
import { PublicPropertyCard } from '@/components/properties/public-property-card'
import { PropertyFilters } from '@/components/properties/property-filters'

export const metadata: Metadata = {
  title: 'Browse properties',
  description: 'Browse homes in the edynsgate network across every tier, from apartments to large houses.',
}

// Always reflect the current set of approved properties.
export const dynamic = 'force-dynamic'

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ zip?: string; tier?: string }>
}) {
  const { zip, tier } = await searchParams
  const tierNum = tier !== undefined && tier !== '' ? Number(tier) : undefined
  const properties = await listApprovedProperties({
    zip: zip?.trim() || undefined,
    tier: tierNum !== undefined && Number.isFinite(tierNum) ? tierNum : undefined,
  })
  const filtered = Boolean(zip || tier)

  return (
    <section className="py-16 sm:py-20">
      <Container className="flex flex-col gap-12">
        <div className="flex max-w-2xl flex-col gap-4">
          <Eyebrow>Available homes</Eyebrow>
          <Heading>Browse the edynsgate network.</Heading>
          <Text size="lg" className="text-pretty">
            <p>
              Explore homes across every tier — from apartments to large houses. Approved tenants can request to move
              into any home they qualify for.
            </p>
          </Text>
        </div>

        <PropertyFilters zip={zip} tier={tier} />

        {properties.length === 0 ? (
          <Card>
            <Text className="text-sm/6">
              <p>{filtered ? 'No homes match these filters. Try clearing them.' : 'No properties are listed yet. Check back soon.'}</p>
            </Text>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((p) => (
              <PublicPropertyCard key={p.id} property={p} />
            ))}
          </div>
        )}
      </Container>
    </section>
  )
}
