// Single source of truth for the VA Corp sister-program network.
//
// Consumed by:
//   - components/site/footer.tsx  → "Sister programs" link group
//   - app/page.tsx                → home-page "Sister programs" cards
//   - app/layout.tsx              → Organization JSON-LD `sameAs` (SEO)
//
// Edit this list and all three update together. Also mirror changes in the
// network docs (SISTER-APPS.md / SEO-BACKLINKS.md), which other apps copy from.
//
// Client-safe: plain data, no `server-only` imports, no secrets.

export type SisterProgram = {
  /** Stable key — also used by app/page.tsx to pick a card icon. */
  id: 'homeschool-plus' | 'rallyup' | 'yotae' | 'spirit-of-santa'
  name: string
  /** Short focus area shown after the name (e.g. "Education"). */
  category: string
  /** Absolute https URL of the program's public site. */
  href: string
  /** One or two sentences, paraphrased from the program's own site — don't overclaim. */
  description: string
}

export const SISTER_PROGRAMS: readonly SisterProgram[] = [
  {
    id: 'homeschool-plus',
    name: 'Homeschool+',
    category: 'Education',
    href: 'https://homeschool-plus.com',
    description:
      'Mastery-based K–12 schooling where students advance by showing what they know, with character taught as coursework.',
  },
  {
    id: 'rallyup',
    name: 'RallyUp',
    category: 'Healthcare & debt relief',
    href: 'https://rallyup.us',
    description: 'Rounds up everyday card purchases and puts the spare change toward paying down your own debts.',
  },
  {
    id: 'yotae',
    name: 'Yotae',
    category: 'Family coaching',
    href: 'https://yotae.life',
    description:
      'Balances the calm of yoga with the confidence of taekwondo, then turns both into coaching the whole family can use every day.',
  },
  {
    id: 'spirit-of-santa',
    name: 'Spirit of Santa',
    category: 'Positive behavior',
    href: 'https://spiritofsanta.com',
    description:
      'Kids do good deeds for their neighbors and earn “Christmas Magic” that helps fund the gifts on their wish list.',
  },
]
