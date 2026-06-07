'use client'

import { useState } from 'react'
import { Link } from '@/components/elements/link'
import { ButtonLink, PlainButtonLink } from '@/components/elements/button'

/** Collapsible navigation for small screens (the desktop nav is hidden < md). */
export function MobileMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <div className="flex flex-1 justify-end md:hidden">
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((v) => !v)}
        className="-mr-2 inline-flex size-11 items-center justify-center rounded-full text-olive-950 hover:bg-olive-950/10 dark:text-white dark:hover:bg-white/10"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-6" aria-hidden="true">
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>

      {open && (
        <div
          id="mobile-nav"
          className="absolute inset-x-0 top-16 border-b border-olive-950/10 bg-olive-100/95 backdrop-blur dark:border-white/10 dark:bg-olive-950/95"
        >
          <nav className="mx-auto flex w-full max-w-2xl flex-col px-6 py-3 md:max-w-3xl">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                className="py-3 text-base text-olive-700 dark:text-olive-400"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-olive-950/10 pt-4 pb-2 dark:border-white/10">
              <PlainButtonLink href="/tenants/login" onClick={close} size="lg" className="w-full">
                Tenant log in
              </PlainButtonLink>
              <ButtonLink href="/partners/login" onClick={close} size="lg" className="w-full">
                Partner log in
              </ButtonLink>
            </div>
          </nav>
        </div>
      )}
    </div>
  )
}
