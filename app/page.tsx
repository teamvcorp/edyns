import { Container } from '@/components/elements/container'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Heading } from '@/components/elements/heading'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Card } from '@/components/elements/card'
import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { BuildingIcon } from '@/components/icons/building-icon'
import { EducationCapIcon } from '@/components/icons/education-cap-icon'
import { SunIcon } from '@/components/icons/sun-icon'
import { HeartIcon } from '@/components/icons/heart-icon'
import { KeyIcon } from '@/components/icons/key-icon'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'

const pillars = [
  {
    icon: BuildingIcon,
    title: 'Housing',
    body: 'Stable, dignified homes managed in partnership with property owners who want their buildings to do more.',
  },
  {
    icon: EducationCapIcon,
    title: 'Education',
    body: 'Learning and skills woven into where people live, so opportunity is never more than a doorstep away.',
  },
  {
    icon: SunIcon,
    title: 'Sustainability',
    body: 'Resource-efficient buildings and programs that lower costs for residents and footprint for the planet.',
  },
  {
    icon: HeartIcon,
    title: 'Equality',
    body: 'Fair access by design — transparent terms and shared upside for every partner and every tenant.',
  },
]

export default function Page() {
  return (
    <>
      {/* Hero */}
      <section id="mission" className="py-20 sm:py-28">
        <Container className="flex max-w-4xl flex-col items-start gap-6">
          <Eyebrow>A life systems company</Eyebrow>
          <Heading>Housing, education, and opportunity — built as one system.</Heading>
          <Text size="lg" className="max-w-2xl text-pretty">
            <p>
              edynsgate connects property partners and tenants around a shared goal: homes that build stability,
              learning, sustainability, and equality together — not one at the expense of another.
            </p>
          </Text>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <ButtonLink href="/partners/login" size="lg">
              I’m a property partner
            </ButtonLink>
            <PlainButtonLink href="/tenants/login" size="lg">
              I’m a tenant <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        </Container>
      </section>

      {/* Pillars */}
      <section id="pillars" className="py-16">
        <Container className="flex flex-col gap-12">
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow>What we do</Eyebrow>
            <Subheading>Four pillars, one connected platform.</Subheading>
            <Text className="text-pretty">
              <p>Every program edynsgate runs is designed to reinforce the other three.</p>
            </Text>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {pillars.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="flex flex-col gap-4">
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-olive-950/5 text-olive-950 dark:bg-white/10 dark:text-white">
                  <Icon className="size-5" />
                </span>
                <h3 className="text-lg font-semibold text-olive-950 dark:text-white">{title}</h3>
                <Text className="text-sm/6">
                  <p>{body}</p>
                </Text>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* Audiences */}
      <section id="audiences" className="py-16">
        <Container className="flex flex-col gap-12">
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow>Who we serve</Eyebrow>
            <Subheading>Two partners. One platform.</Subheading>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="flex flex-col items-start gap-5">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-olive-950/5 text-olive-950 dark:bg-white/10 dark:text-white">
                <BuildingIcon className="size-5" />
              </span>
              <Subheading className="text-2xl/8 sm:text-3xl/9">Property partners</Subheading>
              <Text className="text-pretty">
                <p>
                  List and manage properties, track tenant outcomes, and unlock sustainability incentives — all from a
                  single partner dashboard.
                </p>
              </Text>
              <Link href="/partners/login">
                Partner log in <ArrowNarrowRightIcon />
              </Link>
            </Card>
            <Card className="flex flex-col items-start gap-5">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-olive-950/5 text-olive-950 dark:bg-white/10 dark:text-white">
                <KeyIcon className="size-5" />
              </span>
              <Subheading className="text-2xl/8 sm:text-3xl/9">Tenants</Subheading>
              <Text className="text-pretty">
                <p>
                  Find a home, manage your tenancy, and tap into education and support programs designed to help you get
                  ahead.
                </p>
              </Text>
              <Link href="/tenants/login">
                Tenant log in <ArrowNarrowRightIcon />
              </Link>
            </Card>
          </div>
        </Container>
      </section>

      {/* Call to action */}
      <section className="py-16">
        <Container>
          <Card className="flex flex-col items-start gap-6 bg-olive-950 p-10 ring-0 sm:p-16 dark:bg-olive-900">
            <Subheading className="max-w-2xl text-white">Ready to build housing that does more?</Subheading>
            <Text className="max-w-xl text-olive-300">
              <p>Join edynsgate as a property partner, or sign in to your tenant portal to get started.</p>
            </Text>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href="/partners/login" size="lg" color="light">
                Become a partner
              </ButtonLink>
              <PlainButtonLink href="/tenants/login" size="lg" color="light">
                Tenant log in <ArrowNarrowRightIcon />
              </PlainButtonLink>
            </div>
          </Card>
        </Container>
      </section>
    </>
  )
}
