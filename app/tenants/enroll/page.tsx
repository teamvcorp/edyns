import type { Metadata } from 'next'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Link } from '@/components/elements/link'
import { TenantEnrollForm } from '@/components/auth/tenant-enroll-form'

export const metadata: Metadata = { title: 'Tenant application' }

export default async function TenantEnrollPage({ searchParams }: { searchParams: Promise<{ canceled?: string }> }) {
  const { canceled } = await searchParams

  return (
    <section className="py-16 sm:py-20">
      <Container className="flex max-w-2xl flex-col">
        <Card className="flex flex-col gap-6 p-8 sm:p-10">
          <div className="flex flex-col gap-2">
            <Eyebrow>Tenants · The Effort Exchange</Eyebrow>
            <Subheading className="text-3xl/9">Apply to the program</Subheading>
            <Text className="text-sm/6">
              <p>Tell us about your household and employment. A $25 application fee is collected at the end.</p>
            </Text>
          </div>

          {canceled && (
            <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
              Payment was canceled. Your application is saved — you can pay the fee any time from your portal.
            </p>
          )}

          <TenantEnrollForm />

          <div className="text-sm text-olive-700 dark:text-olive-400">
            Already applied? <Link href="/tenants/login">Sign in</Link>
          </div>
        </Card>
      </Container>
    </section>
  )
}
