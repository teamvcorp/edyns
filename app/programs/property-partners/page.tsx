import type { Metadata } from 'next'
import { Container } from '@/components/elements/container'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Heading } from '@/components/elements/heading'
import { Subheading } from '@/components/elements/subheading'
import { Text } from '@/components/elements/text'
import { Card } from '@/components/elements/card'
import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { HomeIcon } from '@/components/icons/home-icon'
import { SparklesIcon } from '@/components/icons/sparkles-icon'
import { SunIcon } from '@/components/icons/sun-icon'
import { RepeatIcon } from '@/components/icons/repeat-icon'
import { BuildingLibraryIcon } from '@/components/icons/building-library-icon'
import { BanknotesIcon } from '@/components/icons/banknotes-icon'
import { ChartLineIcon } from '@/components/icons/chart-line-icon'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'

export const metadata: Metadata = {
  title: 'Property partners',
  description:
    'Hand off nuisance, problem, or underwater property. Our nonprofit rehabilitates it, adds solar and gray-water reuse, holds the deed, and covers every expense — while you keep 10% equity, paid on resale.',
}

const steps = [
  {
    icon: HomeIcon,
    title: 'You bring the property',
    body: 'We accept nuisance or problem housing, or outright donations — with or without negative equity. Underwater mortgage? Code violations? That’s exactly what we take on.',
  },
  {
    icon: SparklesIcon,
    title: 'We rehabilitate it',
    body: 'Our team brings the home back to life with a full rehabilitation — structure, systems, and finishes — at no cost to you.',
  },
  {
    icon: SunIcon,
    title: 'We make it sustainable',
    body: 'Every home gets solar energy and gray-water reuse, cutting running costs and raising the property’s value and resilience.',
  },
  {
    icon: BuildingLibraryIcon,
    title: 'We hold the deed & handle everything',
    body: 'Our parent nonprofit takes the deed and covers all ongoing expenses and repairs. You walk away from the costs and the headaches.',
  },
]

const upgrades = [
  {
    icon: SunIcon,
    title: 'Solar energy',
    points: [
      'Dramatically lower electricity bills for residents',
      'Cleaner energy and a smaller carbon footprint',
      'Higher appraised value and buyer appeal',
      'Resilience during outages',
    ],
  },
  {
    icon: RepeatIcon,
    title: 'Gray-water reuse',
    points: [
      'Reclaims water for irrigation and flushing',
      'Lower water bills and utility load',
      'A more sustainable, drought-resilient home',
      'A modern feature that increases value',
    ],
  },
]

const dealPoints = [
  {
    icon: BanknotesIcon,
    title: '10% equity, retained',
    body: 'You keep a 10% ongoing equity stake in the property after you hand it over.',
  },
  {
    icon: ChartLineIcon,
    title: 'Paid on resale',
    body: 'When the rehabilitated, upgraded property is sold, you receive your 10% of the value once build-out is complete.',
  },
  {
    icon: BuildingLibraryIcon,
    title: 'Zero ongoing cost',
    body: 'The nonprofit holds the deed and pays for every expense and repair from day one — never you.',
  },
]

export default function PropertyPartnersPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-20 sm:py-28">
        <Container className="flex max-w-4xl flex-col items-start gap-6">
          <Eyebrow>Property partners</Eyebrow>
          <Heading>Turn problem property into lasting value.</Heading>
          <Text size="lg" className="max-w-2xl text-pretty">
            <p>
              Have a property that’s become a burden? We take on nuisance and problem housing — and donations, with or
              without negative equity. We rehabilitate it, add solar and gray-water reuse, hold the deed, and cover every
              expense. You keep a 10% stake, paid when it sells.
            </p>
          </Text>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <ButtonLink href="/partners/enroll" size="lg">
              Enroll now
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
            <Subheading>From liability to legacy, in four steps.</Subheading>
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

      {/* Upgrades */}
      <section className="py-16">
        <Container className="flex flex-col gap-12">
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow>What we add</Eyebrow>
            <Subheading>Upgrades that pay residents back — and raise the value.</Subheading>
            <Text className="text-pretty">
              <p>Every home we take on is rehabilitated and fitted with two systems that lower costs and lift value.</p>
            </Text>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {upgrades.map(({ icon: Icon, title, points }) => (
              <Card key={title} className="flex flex-col gap-5">
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-olive-950/5 text-olive-950 dark:bg-white/10 dark:text-white">
                  <Icon className="size-5" />
                </span>
                <Subheading className="text-2xl/8 sm:text-3xl/9">{title}</Subheading>
                <ul className="flex flex-col gap-2">
                  {points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-base/7 text-olive-700 dark:text-olive-400">
                      <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-olive-400" />
                      {p}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* The deal */}
      <section className="py-16">
        <Container className="flex flex-col gap-12">
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow>Your deal</Eyebrow>
            <Subheading>You keep 10%. We carry the rest.</Subheading>
            <Text className="text-pretty">
              <p>
                The selling partner retains a 10% equity stake for the life of the property. When it’s sold, you receive
                your 10% — after build-out is complete. No expenses, no repairs, no risk in between.
              </p>
            </Text>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {dealPoints.map(({ icon: Icon, title, body }) => (
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

      {/* CTA */}
      <section className="py-16">
        <Container>
          <Card className="flex flex-col items-start gap-6 bg-olive-950 p-10 ring-0 sm:p-16 dark:bg-olive-900">
            <Subheading className="max-w-2xl text-white">Ready to hand off a problem property?</Subheading>
            <Text className="max-w-xl text-olive-300">
              <p>Enroll as a property partner to get started, or sign in to your partner portal.</p>
            </Text>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href="/partners/enroll" size="lg" color="light">
                Enroll now
              </ButtonLink>
              <PlainButtonLink href="/partners/login" size="lg" color="light">
                Sign in <ArrowNarrowRightIcon />
              </PlainButtonLink>
            </div>
          </Card>
        </Container>
      </section>
    </>
  )
}
