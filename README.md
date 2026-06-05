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

The look is the **"Oatmeal" Tailwind Plus kit** adapted to edynsgate. The full reference kit lives in [`demo/`](./demo) (a standalone app, excluded from our build and from git). **Everything you need from it is captured below and in `components/`, so `demo/` can be deleted.**

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
  layout.tsx              Root layout: fonts, <Navbar>, <Main>, <Footer>
  page.tsx                Marketing home (hero, pillars, audiences, CTA)
  globals.css             Tailwind v4 import + olive theme tokens
  actions/auth.ts         Server Actions: loginPartner/Tenant/Admin, logout
  partners/
    login/page.tsx        Partner login (UI)
    page.tsx              Partner portal (protected stub)
  tenants/
    login/page.tsx        Tenant login (UI)
    page.tsx              Tenant portal (protected stub)
  admin/
    login/page.tsx        Admin password gate (UI)
    page.tsx              Admin dashboard (protected stub)
lib/
  mongodb.ts              Lazy, cached MongoClient (getDb())
  session.ts              jose JWT cookie sessions (encrypt/decrypt/create/get/delete)
  users.ts               User collection access (bcrypt verify/create)
  dal.ts                 Data Access Layer: requireSession / requireRole
components/
  elements/              Design-system primitives (from the kit)
  icons/                 SVG icon set (from the kit)
  auth/                  login-form, auth-shell, logout-button
  site/                  navbar, footer, logo, portal-shell
proxy.ts                 Route protection (Next 16 "Middleware")
scripts/seed.mjs         Seed demo accounts
demo/                    Reference kit (git-ignored; safe to delete)
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
| `NEXTAUTH_SECRET` | **session signing** (`lib/session.ts`) | ✅ used now — set a strong value (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | base URL | reserved |
| `ADMIN_PASSWORD` | **admin login** (`app/actions/auth.ts`) | ✅ used now |
| `ADMIN_CREATION_SECRET` | future admin bootstrapping | reserved |
| `MONGODB_URI` | **database** (`lib/mongodb.ts`) | ✅ used now — **stale, replace** |
| `MONGODB_DATABASE` | DB name (`edyns`) | ✅ used now |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (file storage) | configured — **stale, replace** — not wired yet |
| `RESEND_API_KEY`, `FROM_EMAIL`, `FROM_EMAIL_TRAXXAS`, `APPLICATION_EMAIL` | Resend (transactional email) | configured — not wired yet |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe (billing) | configured — not wired yet |
| `PLAID_*`, `NEXT_PUBLIC_PLAID_ENV`, `EE_ENCRYPTION_KEY` | Plaid "Effort Exchange" (KYC / bank link / income) | configured — not wired yet |
| `ACS_*` | Azure Communication Services (SMS / phone) | configured — not wired yet |
| `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `STORE_*` | app URLs / store metadata | reserved |
| `TEST_PRODUCTION_MODE` | test flag | reserved |

> 🔐 `.env` is git-ignored. Never commit real keys. Rotate any key that has been shared.

### Service integration map (build these "one by one")

Each service already has credentials in `.env`; wire each behind a `lib/<service>.ts` client when its feature is built:

- **MongoDB** → `lib/mongodb.ts` (done). Add collections as features land.
- **Vercel Blob** → file/document uploads (partner docs, tenant docs).
- **Stripe** → rent/billing: Customers + PaymentIntents/Checkout + webhooks at `app/api/stripe/webhook/route.ts`.
- **Plaid** → tenant KYC, bank linking, income verification ("Effort Exchange"). Encrypt `plaidAccessToken` at rest with `EE_ENCRYPTION_KEY`.
- **Resend** → transactional email (welcome, password reset, notices).
- **Azure Communication Services** → SMS/phone notifications.

When adding an API endpoint, use a **Route Handler** (`app/api/.../route.ts`) — there is no `pages/` router in this project.

---

## Notes & gotchas

- **No `pages/` directory.** This is a pure App Router app. A top-level `pages/` folder would switch on the legacy Pages Router and conflict.
- **Proxy ≠ Middleware filename.** The file is `proxy.ts` and exports `proxy()` + `config.matcher`.
- **`@/*` path alias** maps to the **project root** (see `tsconfig.json`), e.g. `@/components/...`, `@/lib/...`.
- **Mongo client is lazy** — it connects on first `getDb()`, not at import, so `next build` works without a reachable DB.
- **`demo/` is excluded** from `tsconfig.json` and git, and depends on the `@tailwindplus/elements` insiders package. It's reference-only — delete it once you're comfortable with this README.
