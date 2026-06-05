import type { Metadata } from 'next'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Link } from '@/components/elements/link'
import { EnrollForm } from '@/components/auth/enroll-form'

export const metadata: Metadata = { title: 'Partner enrollment' }

export default function PartnerEnrollPage() {
  return (
    <section className="py-16 sm:py-20">
      <Container className="flex max-w-2xl flex-col">
        <Card className="flex flex-col gap-6 p-8 sm:p-10">
          <div className="flex flex-col gap-2">
            <Eyebrow>Property partners</Eyebrow>
            <Subheading className="text-3xl/9">Enroll as a partner</Subheading>
            <Text className="text-sm/6">
              <p>Tell us a bit about you to get started. You can add properties after your account is created.</p>
            </Text>
          </div>

          <EnrollForm />

          <div className="text-sm text-olive-700 dark:text-olive-400">
            Already enrolled? <Link href="/partners/login">Sign in</Link>
          </div>
        </Card>
      </Container>
    </section>
  )
}
