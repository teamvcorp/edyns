# CODEMAP — reuse map, duplication & review findings

> **Purpose:** read this before writing code so you reuse existing helpers instead of
> re-implementing them. `README.md` covers architecture/env/business rules; this file
> covers *what already exists and where*. Keep it current when you add/remove helpers.
>
> Last full review: 2026-10-30 (commit `2ae8fcb`).

---

## 1. Where to find things (lib/)

All `lib/*.ts` are `server-only` **except** `format.ts` and `tiers.ts` (safe in client components).

| Need | Use | File |
|---|---|---|
| DB handle | `getDb()` | `lib/mongodb.ts` |
| Auth gate in page/action | `requireRole(role, loginPath, {allowMustReset?})`, `requireSession(loginPath)`, `getCurrentSession()` (DB-validated: account exists + `sessionVersion` match + live `mustReset`) | `lib/dal.ts` |
| Auth gate in Route Handler | `sessionWithRole(...roles)` → session or null (return 401) — **never use raw `getSession()` for auth** | `lib/dal.ts` |
| Login page bounce | `redirectIfSignedIn(role, portal)` (proxy no longer does this — it would loop on revoked cookies) | `lib/dal.ts` |
| Session cookie | `createSession`, `getSession`, `deleteSession`, `decrypt` (proxy) | `lib/session.ts` |
| Encrypt a secret at rest | `encryptString` / `decryptString`, `encryptBuffer` / `decryptBuffer` (AES-256-GCM, `EE_ENCRYPTION_KEY`) | `lib/crypto.ts` |
| Compare secrets | `safeEqual(a, b)` (constant-time) | `lib/crypto.ts` |
| Paystubs (admin-only, encrypted in Mongo, no URL) | `savePaystubFile`, `readPaystubFile`, `deletePaystubFile`, `sniffPaystubType`; viewer route `app/admin/tenants/[id]/paystub` | `lib/paystubs.ts` |
| Throttle | `rateLimit({key,limit,windowMs})`, `getClientIp()` | `lib/ratelimit.ts` |
| Validate a Blob URL | `isBlobImageUrl(u)` (https + `*.public.blob.vercel-storage.com`) | `lib/property-input.ts:32` |
| Parse property form | `parsePropertyForm(formData, {admin?})` | `lib/property-input.ts` |
| Money (whole dollars) | `formatCurrency`, `formatNumber`, `formatAddress` — **no cents formatter yet** | `lib/format.ts` |
| Tier labels | `TIERS`, `MIN_TIER`, `MAX_TIER`, `tierLabel(t)` | `lib/tiers.ts` |
| Business constants | `APPLICATION_FEE_CENTS`, `COLLECTION_RATE`, `REQUIRED_WEEKLY_HOURS`, `withProcessingFee`, `processingFeeCents` | `lib/stripe.ts` |
| Stripe client | `getStripe()`; import helpers `fetchCustomerForImport`, `fetchSubscriptionForImport`; `invoiceSubscriptionId(inv)` | `lib/stripe.ts` |
| Plaid | `getPlaid`, `createUserToken`, `createIncomeLinkToken`, `exchangePublicToken`, `removePlaidItem`, `verifyPlaidWebhook` | `lib/plaid.ts` |
| Income math | `readIncome({userToken,selfEmployed,claimedHourlyRate})`, `impliedWeeklyHours` | `lib/income.ts` |
| Email | `sendEmail` + typed senders (credentials, welcome-back, invite, approval, verification-reset, security alert, equity report, 3 invoice emails). Private: `escapeHtml`, `invoiceButton` | `lib/email.ts` |
| Users | `getSessionState` (DAL), `findUserByEmail`, `isEmailTaken`, `verifyCredentials`, `createUser`, `registerPartner`, `resetUserPassword`, `setUserPassword`, `findPartnerById`, `findPartnerByStripeAccountId`, `setStripeAccountId`, `listPartners`, `updatePartner`, `deletePartner` | `lib/users.ts` |
| Tenants | lookups `getTenantBy{UserId,Id,SubscriptionId,StripeCustomer,PlaidItem,PlaidUserId}`; mutations — **note:** some keyed by `userId`, some by `tenantId` (check signature!) | `lib/tenants.ts` |
| Properties | `create/createAsAdmin/transfer/get/list*/approve/reject/update/adminDelete`, `propertyCountsByPartner` | `lib/properties.ts` |
| Equity ledger (source of truth) | `recordRentEquity`, `totalEquityCentsByPartner`, `equityCentsByProperty`, `repricePropertyEquity` | `lib/equity.ts` |
| Payouts | `createPayoutRequest`, `createPaidPayout`, `markPayoutPaid/Declined/ReversedByTransfer`, `totalPaidCentsByPartner`, `pendingCentsByPartner` | `lib/payouts.ts` |
| Invites | `createInvite`, `reissueInvite`, `getValidInviteByToken`, `claimInvite` (atomic), `releaseInvite` | `lib/invites.ts` |
| Project invoices | `createInvoice` … `recordInvoicePayment`, `subtotalOf`, `hasOutstandingBalance` | `lib/invoices.ts` |
| Move-ins | `createMoveInRequest`, `hasActiveRequest`, `setRequestStatus`, `list*` | `lib/moveins.ts` |
| Revenue dashboard | `getRevenueOverview()` | `lib/revenue.ts` |

⚠️ Name clash: `PaymentStatus` exists in both `lib/invoices.ts` and `lib/revenue.ts` with different values.

## 2. Server actions (app/actions/) — all gated

Every exported action that touches data calls `requireRole` first, except intentionally public ones:
login/enroll (IP rate-limited) and `/invoices/[token]` actions (token + IP/token throttle).
Gate quirks: `setPasswordAction` uses raw `getSession()`; `reverseMoveInAction`/`evictMoveInAction`
rely on the private `undoMoveIn` helper's gate — keep an inline gate if refactoring.

**Rule for new actions:** first line = `await requireRole(...)`. Server actions are public POST endpoints.

## 3. UI building blocks (components/)

- Primitives: `components/elements/` — `Button`/`ButtonLink`/`PlainButton`, `Card`, `Container`, `Heading`/`Subheading`, `Text`, `Eyebrow`, `Link`, `Section`, `Breadcrumbs`, `Main`.
- **Input styles:** `components/elements/input.ts` → `inputClass`, `inputClassInline` (16px on mobile = no iOS zoom).
- Shells: `PortalShell` (site/), `AuthShell` (auth/).
- Uploads: `ImageUploader({label,multiple?,value,onChange,pathPrefix?,uploadUrl?})` (partners/) — reusable.
- Forms: `LoginForm`, `EnrollForm`, `TenantEnrollForm`, `SetPasswordForm`; admin forms in `components/admin/`.

## 4. Known duplication (extract before adding a 3rd copy)

| # | Duplicate | Proposed home |
|---|---|---|
| D1 | Private `Field` component ×5 (partner-edit, property-edit, enroll, tenant-enroll, property-form) | `components/elements/field.tsx` |
| D2 | Label class string ~23× | `labelClass` in `elements/input.ts` |
| D4 | `emailRe` ×6 in actions | `lib/validation.ts` → `isEmail` |
| D5/D6 | `num()` ×3, `parsePeople()` ×2 | `lib/validation.ts` |
| D7/D8 | Partner & tenant form validation copied between self-enroll and admin-create | `validatePartnerForm` / `validateTenantForm` |
| D9 | `String(formData.get(k) ?? '').trim()` everywhere | `formStr(fd, k)` |
| D10 | `baseUrl` ×7, **inconsistent trailing-slash strip** | `lib/env.ts` |
| D11 | Cents formatting `$${(c/100).toFixed(2)}` ×5+ | `formatCents` in `lib/format.ts` |
| D12/D13 | Email HTML wrapper + CTA button repeated in `lib/email.ts` | `emailLayout()`, `emailButton()` |
| D14 | Stripe Connect transfer block ×2 (`admin.ts:761`, `:821`) | `transferToPartner()` |
| D15 | Available balance (equity − paid − pending) ×4 | `availableCentsByPartner()` in `lib/payouts.ts` |
| D16 | Default equity share `10` ×4 | export `DEFAULT_EQUITY_SHARE_PERCENT` from `lib/equity.ts` |
| D17 | Stripe customer create + attach ×2 (`tenants.ts`) | `ensureStripeCustomer()` |
| D19 | Best-effort `try{send}catch{}` ×~15, **errors never logged** | `trySend()` that logs |
| D21 | `PropertyOption`/`PartnerOption` types with different shapes | shared types file |
| D22 | `requireRole('admin','/admin/login')` ×38 | `requireAdmin()` in `lib/dal.ts` |
| — | ~120 `ObjectId.isValid` + `new ObjectId` pairs; some userId writes skip the check | `toObjectId(id) → ObjectId \| null` |

Inconsistent action return shapes (`{error}`, `{error,ok}`, `{errors,values,message}`, redirect `?error=`) — consider one `ActionState` type for new code.

## 5. Policy decisions (2026-10-30 — don't undo)

- **Tenants verify income through Plaid only.** No tenant document upload exists. Admins may upload a paystub as a last
  resort (`uploadPaystubAction`), stored encrypted in Mongo; admin then records income with the manual income form.
  Rent setup requires `employment.verified` (a paystub alone is not enough).
- **Uploads accept files, never links.** Images must pass `isBlobImageUrl` (our Blob store); paystubs go as bytes to a
  Server Action and are type-checked by magic bytes.
- **Linking an existing Stripe `acct_` is admin-only** (`linkPartnerStripeAccountAction`, rejects ids already linked to
  another partner). Partners can only create accounts via Stripe-hosted onboarding.
- **Sessions are revocable:** password change/reset bumps `users.sessionVersion`; admin sessions last 8h.

## 6. Review findings (2026-10-30)

Fixed 2026-10-30: Mongo client leak, public paystubs, unvalidated upload URLs, partner acct_ linking, session revocation,
admin/cron timing-safe compares, `mustReset` in DAL, rate-limit index + logging, raw provider errors in API responses,
invoice token/note validation, self-employed input iOS zoom.

Still open:

| | Finding | Where | Fix |
|---|---|---|---|
| 🟠 | Admin = single shared password, no MFA | `app/actions/auth.ts` | Per-admin accounts + MFA (larger project) |
| 🟡 | ~25 silent `catch {}` blocks in actions (email/Stripe failures not logged) | app/actions | Shared `trySend()` that logs (D19) |
| 🟡 | Legacy tenant paystubs still on public Vercel Blob | `tenants.paystub.url` records | Admin re-uploads, then delete old blobs in Vercel dashboard |
| 🟡 | Pre-existing lint errors: setState in effect | `components/tenants/plaid-verify-button.tsx:51,76`, `plaid-oauth-return.tsx:22` | Refactor effects |

Good already: webhook signature checks (Stripe, Identity, Plaid w/ timing-safe), bcrypt w/ dummy-hash timing defense,
AES-GCM token encryption, `server-only` on lib, rate limits on login/signup/Plaid, invite claim is atomic,
HTML escaping in emails, idempotent transfer/equity writes.

## 7. Next planned work

- Admin: adjust a tenant's rent **amount and frequency** after initial setup, synced to the Stripe subscription.
- Admin: **skip a payment** by issuing a credit (Stripe customer balance credit / invoice credit).
