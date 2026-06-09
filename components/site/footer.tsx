import { Container } from '@/components/elements/container'
import { Link } from '@/components/elements/link'
import { Logo } from './logo'

type FooterLink = { href: string; label: string; external?: boolean }
type FooterGroup = { title: string; links: FooterLink[] }

const groups: FooterGroup[] = [
  {
    title: 'Platform',
    links: [
      { href: '/#pillars', label: 'What we do' },
      { href: '/#audiences', label: 'Who we serve' },
      { href: '/partners/login', label: 'Property partners' },
      { href: '/tenants/login', label: 'Tenants' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/#mission', label: 'Mission' },
      { href: '/#', label: 'About' },
      { href: '/#', label: 'Contact' },
    ],
  },
  {
    // Sister programs across the VA Corp network — descriptive, dofollow links.
    title: 'Sister programs',
    links: [
      { href: 'https://homeschool-plus.com', label: 'Homeschool+ — Education', external: true },
      { href: 'https://rallyup.us', label: 'RallyUp — Healthcare', external: true },
      { href: 'https://thegooddeed.net', label: 'The Good Deed — Youth Leadership', external: true },
      { href: 'https://spiritofsanta.com', label: 'Spirit of Santa — Positive Behavior', external: true },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t border-olive-950/10 py-16 dark:border-white/10">
      <Container className="flex flex-col gap-12 lg:flex-row lg:justify-between">
        <div className="flex flex-col gap-4">
          <Logo />
          <p className="max-w-xs text-sm/6 text-olive-700 dark:text-olive-400">
            A life systems company building housing, education, sustainability, and equality as one connected system.
          </p>
          <p className="max-w-xs text-sm/6 text-olive-700 dark:text-olive-400">
            A{' '}
            <Link
              href="https://www.thevacorp.com"
              target="_blank"
              rel="noopener"
              className="font-medium text-olive-950 underline dark:text-white"
            >
              VA Corp
            </Link>{' '}
            program — advancing equality &amp; sustainability in housing, education, and healthcare.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          {groups.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-olive-950 dark:text-white">{group.title}</h3>
              {group.links.map((link, i) => (
                <Link
                  key={`${link.href}-${i}`}
                  href={link.href}
                  className="text-sm/6 font-normal text-olive-700 dark:text-olive-400"
                  {...(link.external ? { target: '_blank', rel: 'noopener' } : {})}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </Container>
      <Container className="mt-12 text-sm text-olive-600 dark:text-olive-500">
        © {new Date().getFullYear()} edynsgate. All rights reserved.
      </Container>
    </footer>
  )
}
