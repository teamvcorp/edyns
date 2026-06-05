import { Container } from '@/components/elements/container'
import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { Logo } from './logo'

const navLinks = [
  { href: '/properties', label: 'Browse homes' },
  { href: '/#pillars', label: 'What we do' },
  { href: '/#audiences', label: 'Who we serve' },
]

export function Navbar() {
  return (
    <header className="sticky top-0 z-10 bg-olive-100/90 backdrop-blur dark:bg-olive-950/90">
      <Container className="flex h-16 items-center gap-6">
        <Logo />
        <nav className="flex flex-1 items-center gap-6 max-md:hidden">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="text-olive-700 dark:text-olive-400">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
          <PlainButtonLink href="/tenants/login">Tenant log in</PlainButtonLink>
          <ButtonLink href="/partners/login">Partner log in</ButtonLink>
        </div>
      </Container>
    </header>
  )
}
