import type { Metadata } from 'next'
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
      </head>
      <body className="font-sans text-olive-950 dark:text-white">
        <Navbar />
        <Main>{children}</Main>
        <Footer />
      </body>
    </html>
  )
}
