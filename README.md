# edynsgate

A **life systems** web app — housing, education, sustainability, and equality built as one connected system. It serves two primary audiences plus staff:

- **Property partners** — own/manage properties in the network (`/partners`)
- **Tenants** — live in and benefit from the network (`/tenants`)
- **Admin** — password-gated staff area (`/admin`)

Built with **Next.js 16 (App Router) + React 19 + Tailwind CSS v4**.

> ⚠️ **Next.js 16 has breaking changes vs. earlier versions.** Per [`AGENTS.md`](./AGENTS.md), read the relevant guide in `node_modules/next/dist/docs/` **before** writing code. The biggest gotcha: **Middleware is now called "Proxy"** (`proxy.ts`, not `middleware.ts`).

---

## Quick start

```bash
npm install

# 1. Fill in .env (see "Environment variables" below). The committed values are
#    placeholders — MONGODB_URI and BLOB_READ_WRITE_TOKEN are stale and must be
#    replaced with live credentials.

# 2. Seed two demo accounts (needs a live MONGODB_URI):
npm run seed
#   partner@edynsgate.test / partner123
#   tenant@edynsgate.test  / tenant123

# 3. Run it:
npm run dev          # http://localhost:3000
```

Admin login uses the `ADMIN_PASSWORD` from `.env` (no account needed).

Other scripts: `npm run build`, `npm start`, `npm run lint`.

---

## Design system

The look is the **"Oatmeal" Tailwind Plus kit** adapted to edynsgate. (The `demo/` reference kit has been **deleted** — everything needed from it is captured below and in `components/`.)

### Tokens (`app/globals.css`)

- **Palette:** a single custom OKLCH ramp, `olive-50 … olive-950` (warm green — reads as sustainability/housing). There is no default Tailwind blue/gray in use. Page background is `olive-100` (light) / `olive-950` (dark).
- **Fonts:** `--font-display` = **Instrument Serif** (headings), `--font-sans` = **Inter** (body). Loaded by family name via `<link>` in `app/layout.tsx` — the `@theme` tokens reference those exact family names, so don't swap to `next/font` without updating the tokens.
- **Dark mode:** every component pairs light/dark utilities, e.g. `text-olive-950 dark:text-white`.

### Component primitives (`components/elements/`)

Small, composable, single-responsibility pieces. Each takes `className` + `...props` and merges with **`clsx/lite`**, so styling is overridable per use.

| Component | Role |
|---|---|
| `Container` | width + horizontal gutters (`max-w-7xl`, responsive padding) |
| `Heading` / `Subheading` | display-serif h1 / h2 |
| `Eyebrow` | small label above a heading |
| `Text` | body copy (`md` / `lg`) in `olive-700/400` |
| `Button` | pill buttons — `Button` / `SoftButton` / `PlainButton` (+ `…Link` variants), props `size` (`md`/`lg`) and `color` (`dark/light`/`light`) |
| `Link` | inline text link |
| `Card` | rounded white/olive-900 surface with ring (added for edynsgate) |
| `Main` | `<main>` wrapper |

`Screenshot` / `Wallpaper` (decorative gradient + noise frames) are kept for later use. `components/icons/` holds ~100 line-style SVG icons (`<XxxIcon />`).

### Conventions

1. **`clsx/lite`** for all class merging.
2. **Pills everywhere** — buttons/badges are `rounded-full`.
3. **Variants via props**, not new components, where possible.
4. **Sections** are full-width `<section className="py-16">` wrapping a `Container`; pages are a vertical stack of sections (see `app/page.tsx`).
5. **Server Components by default.** Add `'use client'` only when you need interactivity/hooks (e.g. `components/auth/login-form.tsx`).

---

## Project structure

```
app/
  layout.tsx              Root layout: fonts, <Navbar>, <Main>, <Footer>, org JSON-LD
  page.tsx                Marketing home (hero, pillars, audiences, CTA)
  globals.css             Tailwind v4 import + olive theme tokens
  privacy/ terms/         Legal pages
  programs/               Public program explainers (property-partners, tenants)
  properties/             Public listings + [id] detail (move-in requests)
  actions/                Server Actions: auth, admin, admin-create, partners,
                          tenants, properties, moveins, payouts, invoices, plaid
  partners/               Partner portal: enroll, login, set-password,
                          properties (list + new), payouts
  tenants/                Tenant portal: enroll (+ complete), login, set-password,
                          plaid-oauth (OAuth return page)
  admin/                  Admin portal: dashboard, partners, properties,
                          tenants (+ import from Stripe), move-ins, payouts,
                          invoices (list / new / [id] detail)
  invoices/[token]/       PUBLIC invoice page (accept / decline / pay) + paid/ receipt
  api/
    stripe/webhook/       Stripe webhook — routes by metadata.type (see gotchas!)
    identity/             Stripe Identity: start, status, webhook
    plaid/webhook/        Plaid income webhooks
    tenants/plaid/link-token/   Plaid Link token creation
    partners/upload/, tenants/upload/   Vercel Blob client uploads
    cron/income-check/    Daily income re-check (vercel.json cron + CRON_SECRET)
lib/
  mongodb.ts              Lazy, cached MongoClient (getDb())
  session.ts              jose JWT cookie sessions (create/get/delete)
  dal.ts                  requireSession / requireRole — the authoritative gate
  users.ts                users collection (bcrypt verify/create)
  tenants.ts              tenant records, billing status/frequency
  properties.ts           property records
  moveins.ts              move-in requests
  payouts.ts              partner payouts
  equity.ts               partner equity reports
  invoices.ts             project invoices: draft→sent→accepted→completed
  income.ts               monthly-income math from Plaid payroll data
  plaid.ts                Plaid client (link/user tokens, payroll income)
  stripe.ts               Stripe client + business constants + subscription import
  email.ts                Resend senders (credentials, approval, equity, invoices…)
  crypto.ts               AES-256-GCM (EE_ENCRYPTION_KEY) for Plaid tokens at rest
  ratelimit.ts            Mongo-backed rate limiting
  tiers.ts                housing tier ladder (tier 0 apartment → up)
  format.ts               currency formatting helpers
components/
  elements/               Design-system primitives (from the kit)
  icons/                  SVG icon set (from the kit)
  auth/                   login / enroll / set-password forms, auth-shell, logout
  site/                   navbar, footer, logo, mobile-menu, portal-shell, secret-admin
  admin/                  admin forms (invoices, tenants, partners, Stripe import…)
  partners/               property form/cards, image uploader, equity report modal
  tenants/                Plaid + Stripe Identity verify buttons, paystub uploader
  properties/             public property cards, filters, move-in button
  invoices/               public invoice summary
proxy.ts                  Route protection (Next 16 "Middleware")
scripts/                  seed.mjs + Plaid sandbox/e2e probe scripts
docs/                     stripe-identity-setup.md + vendor notes (Resend receiving)
vercel.json               Cron: /api/cron/income-check daily at 12:00 UTC
```

---

## Authentication & authorization

We follow the pattern from the Next.js 16 auth guide (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`): **stateless `jose` JWT sessions in an HttpOnly cookie**, optimistic checks in `proxy.ts`, and authoritative checks in the DAL.

> **Why not NextAuth?** NextAuth v5 is still beta and overlaps awkwardly with Next 16's Proxy rename / runtime model. The documented jose approach is simpler, role-aware, and dependency-light. The `NEXTAUTH_SECRET` env var is reused as the session signing key, so swapping to NextAuth later is straightforward.

**Flow**

1. A login page renders `LoginForm` (client) → calls a Server Action in `app/actions/auth.ts`.
2. Partner/tenant credentials are checked against the Mongo `users` collection (`lib/users.ts`, bcrypt). Admin is checked against `ADMIN_PASSWORD`.
3. On success, `createSession({ sub, role, name })` signs a JWT and sets the `edyns_session` cookie.
4. `proxy.ts` runs on `/partners|/tenants|/admin` and does **optimistic** redirects (reads cookie only — never the DB).
5. Each protected page calls `requireRole(role, loginPath)` from `lib/dal.ts` — the **real** gate. **Always do this in the page/action; never rely on proxy alone.**

**Roles:** `'partner' | 'tenant' | 'admin'`. The `users` collection stores only `partner`/`tenant`; `admin` is password-only with no record.

**Adding a protected page:** put it under `app/<area>/…`, and start the component with `await requireRole('<role>', '/<area>/login')`.

---

## Environment variables

All config lives in `.env` (git-ignored). The repo's values are placeholders for local/sandbox use.

| Variable | Used by | Status |
|---|---|---|
| `NEXTAUTH_SECRET` | **session signing** (`lib/session.ts`) | ✅ wired — set a strong value (`openssl rand -base64 32`) |
| `ADMIN_PASSWORD` | **admin login** (`app/actions/auth.ts`) | ✅ wired |
| `MONGODB_URI`, `MONGODB_DATABASE` | **database** (`lib/mongodb.ts`) | ✅ wired |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob uploads — read implicitly by `@vercel/blob` (upload routes) | ✅ wired |
| `RESEND_API_KEY`, `FROM_EMAIL` | Resend sender (`lib/email.ts`) | ✅ wired |
| `ALERT_EMAIL` | security-alert recipient (falls back to `FROM_EMAIL`) | optional |
| `INVOICE_FROM_EMAIL` | project-invoice sender (default `edynsgate Billing <billing@fyht4.com>`) | optional |
| `INVOICE_REPLY_TO` | reply-to on invoice emails → a monitored inbox | optional |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe billing, checkout, webhook (`lib/stripe.ts`, `app/api/stripe/webhook`) | ✅ wired |
| `STRIPE_IDENTITY_WEBHOOK_SECRET` | Stripe Identity webhook (falls back to `STRIPE_WEBHOOK_SECRET`) | ✅ wired |
| `PLAID_CLIENT_ID`, `PLAID_ENV`, `PLAID_SANDBOX_SECRET` / `PLAID_PRODUCTION_SECRET` (or `PLAID_SECRET`), `PLAID_REDIRECT_URI`, `PLAID_WEBHOOK_URL` | Plaid income verification (`lib/plaid.ts`) | ✅ wired |
| `EE_ENCRYPTION_KEY` | AES-256-GCM key for Plaid tokens at rest (`lib/crypto.ts`) | ✅ wired |
| `CRON_SECRET` | authorizes `/api/cron/income-check` | ✅ wired |
| `NEXT_PUBLIC_BASE_URL` | absolute URLs in emails / Stripe + Plaid redirects | ✅ wired |
| `NEXTAUTH_URL`, `ADMIN_CREATION_SECRET`, `NEXT_PUBLIC_APP_URL`, `STORE_*`, `TEST_PRODUCTION_MODE`, `ACS_*` | reserved — not referenced in code | — |

> 🔐 `.env` is git-ignored. Never commit real keys. Rotate any key that has been shared.

### Service integrations (current state)

All major services are **wired** behind `lib/<service>.ts` clients:

- **MongoDB** → `lib/mongodb.ts`. Collections: users, tenants, properties, move-ins, payouts, equity, invoices, rate limits.
- **Vercel Blob** → client uploads via `handleUpload` (`app/api/partners/upload`, `app/api/tenants/upload`): property photos, paystubs, invoice work photos.
- **Stripe** → tenant billing (checkout + subscriptions, incl. importing existing subscriptions by ID), project invoices, webhook at `app/api/stripe/webhook/route.ts`. Business constants in `lib/stripe.ts`: $25 application fee, 40% collection rate, 35 required weekly hours.
- **Stripe Identity** → ID + selfie verification (`app/api/identity/*`); replication guide in `docs/stripe-identity-setup.md`.
- **Plaid** → income verification via **user tokens + payroll income** (standard Income product, **not** CRA). Access tokens encrypted at rest with `EE_ENCRYPTION_KEY`. Daily re-check via the cron route. Sandbox/e2e probe scripts in `scripts/`.
- **Resend** → credentials, welcome-back, approval, security-alert, equity-report, and project-invoice emails (`lib/email.ts`). Invoice mail sends from `INVOICE_FROM_EMAIL` with `INVOICE_REPLY_TO`.
- **Azure Communication Services** → **not wired** (credentials reserved for future SMS).

When adding an API endpoint, use a **Route Handler** (`app/api/.../route.ts`) — there is no `pages/` router in this project.

---

## Business rules (do not get these wrong)

- **Eligibility = effort, never income.** Tenant approval is based **only** on the 35-hr/week effort commitment. Income is **never** an approval criterion — Plaid income data is used solely to set the rent amount (40% of verified monthly income, `COLLECTION_RATE` in `lib/stripe.ts`).
- **Stripe Checkout sessions MUST set `metadata.type`.** The webhook routes on it (e.g. `type: 'project_invoice'` + `invoiceId` + `phase`). A session without it is treated as a **tenant fee** and misrouted.
- **Project-invoice flow** (admin-only): propose (`draft`→`sent`, proposal email) → recipient accepts/declines on the public `/invoices/[token]` page → pay in full or 50% deposit via Stripe Checkout → admin completes with a finished-work photo (`completed`, balance-due email). Statuses in `lib/invoices.ts`.
- **Plaid is the standard Income product** (user tokens + payroll income), **not** CRA — don't "upgrade" the integration to CRA endpoints.
- **Sister-program cross-links live in 3 synced spots:** footer nav, layout JSON-LD `sameAs`, and `SISTER-APPS.md` / `SEO-BACKLINKS.md`. Change one → change all three.

---

## Notes & gotchas

- **No `pages/` directory.** This is a pure App Router app. A top-level `pages/` folder would switch on the legacy Pages Router and conflict.
- **Proxy ≠ Middleware filename.** The file is `proxy.ts` and exports `proxy()` + `config.matcher` for `/partners`, `/tenants`, `/admin` (login/enroll paths are public).
- **`@/*` path alias** maps to the **project root** (see `tsconfig.json`), e.g. `@/components/...`, `@/lib/...`.
- **Mongo client is lazy** — it connects on first `getDb()`, not at import, so `next build` works without a reachable DB.
- **`demo/` is gone** — the reference kit was deleted after its pieces were absorbed into `components/`.
- **Cron:** `vercel.json` schedules `/api/cron/income-check` daily at 12:00 UTC; the route requires the `CRON_SECRET` bearer token.
- **Verify with `npm run build`** — there is no test suite; live smoke-testing is done manually.

---

## Related docs

- [`AGENTS.md`](./AGENTS.md) — **read first**: Next.js 16 breaking-changes warning (docs in `node_modules/next/dist/docs/`).
- [`SISTER-APPS.md`](./SISTER-APPS.md) / [`SEO-BACKLINKS.md`](./SEO-BACKLINKS.md) — VA Corp network cross-linking (footer + JSON-LD).
- [`STRIPE_IDENTITY_SETUP.md`](./STRIPE_IDENTITY_SETUP.md) — generic Stripe Identity guide; [`docs/stripe-identity-setup.md`](./docs/stripe-identity-setup.md) — how **this** app implements it.
- [`docs/vendor/resend-receiving-emails.md`](./docs/vendor/resend-receiving-emails.md) — Resend inbound-email notes.
