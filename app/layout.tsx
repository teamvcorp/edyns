import type { Metadata, Viewport } from 'next'
import './globals.css'

import { Main } from '@/components/elements/main'
import { Navbar } from '@/components/site/navbar'
import { Footer } from '@/components/site/footer'

export const metadata: Metadata = {
  title: {
    default: 'edynsgate — housing, education, sustainability, equality',
    template: '%s · edynsgate',
  },
  description:
    'edynsgate is a life systems company building housing, education, sustainability, and equality as one connected system for property partners and tenants.',
  applicationName: 'edynsgate',
  // iOS "Add to Home Screen": run standalone with a clean title + status bar.
  appleWebApp: {
    capable: true,
    title: 'edynsgate',
    statusBarStyle: 'default',
  },
}

// Brand the mobile browser chrome and declare light/dark support. We do not
// disable pinch-zoom — keeping the default scale is an accessibility win.
export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f1efe7' },
    { media: '(prefers-color-scheme: dark)', color: '#21201a' },
  ],
}

// Organization structured data: positions edynsgate as a program of VA Corp and
// cross-references the sibling program sites so search engines see one network.
const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Edynsgate',
  url: 'https://www.edynsgate.com',
  parentOrganization: {
    '@type': 'NGO',
    name: 'VA Corp',
    url: 'https://www.thevacorp.com',
  },
  sameAs: [
    'https://www.thevacorp.com',
    'https://homeschool-plus.com',
    'https://rallyup.us',
    'https://thegooddeed.net',
    'https://spiritofsanta.com',
    'https://app.fyht4.com',
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Fonts are referenced by family name from the design tokens in globals.css */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap"
          rel="stylesheet"
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
      </head>
      <body className="font-sans text-olive-950 dark:text-white">
        <Navbar />
        <Main>{children}</Main>
        <Footer />
      </body>
    </html>
  )
}
