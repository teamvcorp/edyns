import { Container } from '@/components/elements/container'
import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { LogoutButton } from '@/components/auth/logout-button'
import { getSession } from '@/lib/session'
import { Logo } from './logo'
import { MobileMenu } from './mobile-menu'

const navLinks = [
  { href: '/properties', label: 'Browse homes' },
  { href: '/#pillars', label: 'What we do' },
  { href: '/#audiences', label: 'Who we serve' },
]

// The portal a logged-in audience returns to from the header.
const portals: Record<'partner' | 'tenant', { href: string; label: string }> = {
  partner: { href: '/partners', label: 'Partner portal' },
  tenant: { href: '/tenants', label: 'Tenant portal' },
}

export async function Navbar() {
  const session = await getSession()
  const portal = session?.role === 'partner' || session?.role === 'tenant' ? portals[session.role] : null

  return (
    <header className="sticky top-0 z-20 bg-olive-100/90 backdrop-blur dark:bg-olive-950/90">
      <Container className="flex h-16 items-center gap-6">
        <Logo />
        <nav className="flex flex-1 items-center gap-6 max-md:hidden">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="text-olive-700 dark:text-olive-400">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="items-center justify-end gap-2 max-md:hidden md:flex md:flex-none">
          {portal ? (
            <>
              <PlainButtonLink href={portal.href}>{portal.label}</PlainButtonLink>
              <LogoutButton />
            </>
          ) : (
            <>
              <PlainButtonLink href="/tenants/login">Tenant log in</PlainButtonLink>
              <ButtonLink href="/partners/login">Partner log in</ButtonLink>
            </>
          )}
        </div>
        <MobileMenu links={navLinks} portal={portal} />
      </Container>
    </header>
  )
}
