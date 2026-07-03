# Sister apps — cross-link setup (quick README)

Drop these links into any VA Corp sibling app so the whole network cross-links.
Two places per app: the **footer nav** (visible links) and the page **JSON-LD
`sameAs`** (structured-data signal). Use descriptive, dofollow anchor text in the
form `Name — Focus`.

> For the full SEO playbook (rationale, dofollow rules, verification) see
> [SEO-BACKLINKS.md](SEO-BACKLINKS.md). This file is the fast copy-paste version.

## The network

Parent hub: **VA Corp** — https://www.thevacorp.com

| App | Focus | URL |
|---|---|---|
| Edynsgate | Housing | https://www.edynsgate.com |
| Homeschool+ | Education | https://homeschool-plus.com |
| RallyUp | Healthcare & debt relief | https://rallyup.us |
| The Good Deed | Youth Leadership | https://thegooddeed.net |
| Spirit of Santa | Positive Behavior | https://spiritofsanta.com |
| Black Belt Parenting | Parenting | https://app.fyht4.com |

**When adding your app to the network:** add your own app to this table, and add
these siblings (everyone except yourself) to your footer + `sameAs`. Do NOT list
your own URL in your `sameAs`.

## 1. Footer links

Framework-agnostic — a "Sister programs" group. React/Next example:

```tsx
// components/site/footer.tsx — a group in your footer's `groups` array
{
  title: 'Sister programs',
  links: [
    { href: 'https://www.thevacorp.com', label: 'VA Corp — Parent network', external: true },
    { href: 'https://www.edynsgate.com', label: 'Edynsgate — Housing', external: true },
    { href: 'https://homeschool-plus.com', label: 'Homeschool+ — Education', external: true },
    { href: 'https://rallyup.us', label: 'RallyUp — Healthcare & debt relief', external: true },
    { href: 'https://thegooddeed.net', label: 'The Good Deed — Youth Leadership', external: true },
    { href: 'https://spiritofsanta.com', label: 'Spirit of Santa — Positive Behavior', external: true },
    { href: 'https://app.fyht4.com', label: 'Black Belt Parenting — Parenting', external: true },
    // ...remove your own app from this list
  ],
}
```

Plain HTML equivalent:

```html
<nav aria-label="Sister programs">
  <a href="https://www.thevacorp.com">VA Corp — Parent network</a>
  <a href="https://www.edynsgate.com">Edynsgate — Housing</a>
  <a href="https://homeschool-plus.com">Homeschool+ — Education</a>
  <a href="https://rallyup.us">RallyUp — Healthcare & debt relief</a>
  <a href="https://thegooddeed.net">The Good Deed — Youth Leadership</a>
  <a href="https://spiritofsanta.com">Spirit of Santa — Positive Behavior</a>
  <a href="https://app.fyht4.com">Black Belt Parenting — Parenting</a>
</nav>
```

## 2. Organization JSON-LD `sameAs`

Add to your root layout's Organization structured data (URLs only, no anchor text,
no self):

```ts
// app/layout.tsx
const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'NGO',
  name: 'Your App Name',
  url: 'https://your-app.com',
  parentOrganization: { '@type': 'NGO', name: 'VA Corp', url: 'https://www.thevacorp.com' },
  sameAs: [
    'https://www.thevacorp.com',
    'https://www.edynsgate.com',
    'https://homeschool-plus.com',
    'https://rallyup.us',
    'https://thegooddeed.net',
    'https://spiritofsanta.com',
    'https://app.fyht4.com',
    // ...remove your own URL
  ],
}
```

## Keep in sync

Whenever a sibling is added, renamed, or changes URL, update **all** of: this
file, the footer group, and the `sameAs` array — in every sibling repo. Bare-domain
URLs except VA Corp (`www`). Edynsgate is `www.edynsgate.com`.
