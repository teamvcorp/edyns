import type { Metadata } from 'next'
import { Container } from '@/components/elements/container'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Heading } from '@/components/elements/heading'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Card } from '@/components/elements/card'
import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { ClockIcon } from '@/components/icons/clock-icon'
import { HomeIcon } from '@/components/icons/home-icon'
import { BanknotesIcon } from '@/components/icons/banknotes-icon'
import { FingerprintIcon } from '@/components/icons/fingerprint-icon'
import { HeartIcon } from '@/components/icons/heart-icon'
import { BookOpenIcon } from '@/components/icons/book-open-icon'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'

export const metadata: Metadata = {
  title: 'Tenants — Effort Exchange',
  description:
    'The Effort Exchange: work a minimum of 35 hours a week and your rent and utilities are fully covered. Surplus builds a savings account for repairs and upgrades.',
}

const steps = [
  {
    icon: ClockIcon,
    title: 'Commit your effort',
    body: 'Work a minimum of 35 hours per week. That commitment is the foundation of the Effort Exchange.',
  },
  {
    icon: HomeIcon,
    title: 'Rent & utilities, covered',
    body: 'Your effort covers all rent and utility fees — no monthly bills hanging over you, just peace of mind and stability.',
  },
  {
    icon: BanknotesIcon,
    title: 'Surplus builds savings',
    body: 'Effort beyond what’s needed is stored in a savings account set aside for repairs and upgrades to your home.',
  },
  {
    icon: FingerprintIcon,
    title: 'Verified at sign-up',
    body: 'During sign-up we verify identity, income, and payments through Plaid and Stripe so the exchange stays fair and transparent.',
  },
]

const benefits = [
  {
    icon: HeartIcon,
    title: 'Peace of mind',
    body: 'No rent invoice, no utility bill, no late-fee anxiety. Your housing is secured by the work you already do.',
  },
  {
    icon: BanknotesIcon,
    title: 'A savings cushion',
    body: 'Surplus effort funds a dedicated account for repairs and upgrades — so your home keeps getting better.',
  },
  {
    icon: BookOpenIcon,
    title: 'A clear program',
    body: 'All profit stays with the nonprofit, but it remains accessible to you while you’re in the program, under our rules and regulations.',
  },
]

export default function TenantsProgramPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-20 sm:py-28">
        <Container className="flex max-w-4xl flex-col items-start gap-6">
          <Eyebrow>Tenants · The Effort Exchange</Eyebrow>
          <Heading>Your effort is your rent.</Heading>
          <Text size="lg" className="max-w-2xl text-pretty">
            <p>
              The Effort Exchange is simple: work a minimum of 35 hours a week and your rent and utilities are fully
              covered. No bills, no surprises — just a stable home and peace of mind. Anything beyond what’s needed goes
              into a savings account for repairs and upgrades.
            </p>
          </Text>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <ButtonLink href="/tenants/enroll" size="lg">
              Apply now
            </ButtonLink>
            <PlainButtonLink href="#how-it-works" size="lg">
              See how it works <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-16">
        <Container className="flex flex-col gap-12">
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow>How it works</Eyebrow>
            <Subheading>Trade effort for stability — in four steps.</Subheading>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ icon: Icon, title, body }, i) => (
              <Card key={title} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-10 items-center justify-center rounded-full bg-olive-950/5 text-olive-950 dark:bg-white/10 dark:text-white">
                    <Icon className="size-5" />
                  </span>
                  <span className="font-display text-2xl text-olive-400">{i + 1}</span>
                </div>
                <h3 className="text-lg font-semibold text-olive-950 dark:text-white">{title}</h3>
                <Text className="text-sm/6">
                  <p>{body}</p>
                </Text>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* The 35-hour exchange — highlight */}
      <section className="py-16">
        <Container>
          <Card className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:gap-12">
            <div className="flex flex-col items-start">
              <span className="font-display text-7xl tracking-tight text-olive-950 sm:text-8xl dark:text-white">
                35
              </span>
              <span className="text-sm font-semibold text-olive-700 dark:text-olive-400">hours / week</span>
            </div>
            <div className="flex flex-col gap-2">
              <Subheading className="text-2xl/8 sm:text-3xl/9">One commitment covers it all.</Subheading>
              <Text className="text-pretty">
                <p>
                  Thirty-five hours a week is the whole price of admission. Meet it, and your rent and every utility are
                  taken care of — giving you the stability to focus on what comes next.
                </p>
              </Text>
            </div>
          </Card>
        </Container>
      </section>

      {/* Benefits */}
      <section className="py-16">
        <Container className="flex flex-col gap-12">
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow>Why it works</Eyebrow>
            <Subheading>Stability you can count on.</Subheading>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {benefits.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="flex flex-col gap-3">
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

      {/* Verification note */}
      <section className="py-16">
        <Container>
          <Card className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-olive-950/5 text-olive-950 dark:bg-white/10 dark:text-white">
                <FingerprintIcon className="size-5" />
              </span>
              <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Fair, verified, transparent</h3>
            </div>
            <Text className="max-w-2xl text-sm/6">
              <p>
                During sign-up, we’ll verify your identity, income, and payments through Plaid and Stripe. This keeps the
                Effort Exchange fair for everyone. All profit stays with the nonprofit and remains accessible to you
                while you’re in the program, under our rules and regulations.
              </p>
            </Text>
          </Card>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-16">
        <Container>
          <Card className="flex flex-col items-start gap-6 bg-olive-950 p-10 ring-0 sm:p-16 dark:bg-olive-900">
            <Subheading className="max-w-2xl text-white">Ready to trade effort for a stable home?</Subheading>
            <Text className="max-w-xl text-olive-300">
              <p>Apply to the Effort Exchange to get started, or sign in to your tenant portal.</p>
            </Text>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href="/tenants/enroll" size="lg" color="light">
                Apply now
              </ButtonLink>
              <PlainButtonLink href="/tenants/login" size="lg" color="light">
                Sign in <ArrowNarrowRightIcon />
              </PlainButtonLink>
            </div>
          </Card>
        </Container>
      </section>
    </>
  )
}
