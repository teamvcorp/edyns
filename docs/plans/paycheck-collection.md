# Plan: collect the program percentage from every paycheck (Plaid Transactions)

Status: **PLANNED — not started.** Decided 2026-11-14 (option A). Build locally; **do not push until Plaid
approves Transactions for production.** Ships behind a feature flag either way.

## Context

Today each tenant pays a **fixed amount on a fixed schedule** (one Stripe subscription), suggested from their
*average* verified income. The business wants the program percentage (40% / 30% / 30%+10% / 10% —
`lib/programs.ts`) taken from **each paycheck as it arrives**, so collection tracks real pay.

Key constraints found while planning:
- Employees verified income by linking their **payroll provider** (Plaid Income), so there is **no bank
  connection to watch**. Tenants must link their bank with Plaid **Transactions** (new product, needs approval).
- The debit itself comes from the bank account saved in **Stripe** (application-fee Checkout). Detected deposits
  and debits should be on the **same account** — compare Plaid account mask with Stripe `us_bank_account.last4`.
- Variable-amount recurring debits need an explicit authorization that states **how the amount is calculated**
  (Nacha/Stripe) and Reg E **variable-amount notice** (or a consumer-elected range). See
  `docs/vendor/stripe-ach-variable-debits.md`. **Counsel review before launch.**
- ACH settles in up to 4 business days and can be disputed for 60 days; a dispute kills the mandate.

## Approach

Per tenant, `billing.mode` becomes `'schedule'` (today's subscription, default) or `'paycheck'`. Paycheck mode:
Plaid tells us a payroll deposit posted → we create **one off-session ACH PaymentIntent** for the program % of that
deposit → the webhook records it exactly like today's paid invoices (program ledger / partner equity).

Everything reuses existing pieces: program rates + split (`lib/programs.ts`), `withProcessingFee`
(`lib/fees.ts`), ledger (`lib/program-ledger.ts`), equity (`lib/equity.ts`), encrypted tokens (`lib/crypto.ts`),
webhook verification (`verifyPlaidWebhook`), logging (`lib/log.ts`), rate limits, email senders.

### Phase 1 — Foundations
- `PAYCHECK_COLLECTION_ENABLED` env flag (off by default; production stays off until Plaid approval + legal).
- Tenant model: `bankLink { itemId, accessTokenEnc, accountId, mask, institution, cursor, status, linkedAt,
  collectFrom: Date }` and `billing.mode`.
- New `lib/paychecks.ts` + `deposits` collection: `{ tenantId, plaidTransactionId (unique), accountId, amountCents,
  date, payer, category, classification: 'wages' | 'review' | 'ignored', status: 'detected' | 'collecting' |
  'collected' | 'failed' | 'skipped', collection { paymentIntentId, rentCents, carCents, chargedCents, status,
  failureCode } }`.

### Phase 2 — Bank link for Transactions
- `createTransactionsLinkToken` in `lib/plaid.ts` (`products: ['transactions']`, webhook, redirect_uri).
- Tenant "Link the bank account your paycheck goes to" (reuses the Plaid Link button pattern + OAuth return page).
- Exchange → store encrypted token, pick the deposit account, record mask; warn if it doesn't match the Stripe
  account's last 4. First `/transactions/sync` with no cursor to activate webhooks.
- **History is never charged:** `collectFrom` = the moment paycheck mode is turned on.

### Phase 3 — Sync + paycheck detection
- Plaid webhook: `TRANSACTIONS` / `SYNC_UPDATES_AVAILABLE` → sync that Item (per-Item Mongo lock; full pagination
  loop; restart on `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`; save cursor only after a complete run).
- Daily fallback cron re-syncs every linked Item (missed webhooks).
- Classification (decided 2026-11-14): posted (not pending), inflow (`amount < 0`), on the linked account, dated
  ≥ `collectFrom`, ≥ a minimum (e.g. $50):
  - **Self-employed tenants: every qualifying deposit is collected automatically.**
  - Employees: `INCOME_WAGES` category or `income_source` counterparty → **wages**, collected automatically.
  - Employees, non-wage inflows: collected automatically **while the tenant's edynsgate account is negative**
    (they owe — e.g. an unpaid shortfall or a failed collection); otherwise → **review** (admin includes or
    ignores). *(Interpretation pending confirmation.)*
  - Transfers between the tenant's own accounts and tiny amounts → **ignored**.
- `removed`/`modified` handled; dedupe by `plaid_transaction_id` and `pending_transaction_id`.
- Item health webhooks (`ITEM_LOGIN_REQUIRED`, `PENDING_DISCONNECT`, revoked) → flag + ask tenant to re-link;
  collections pause while unhealthy.

### Phase 4 — Authorization (legal)
- Tenant authorization screen before paycheck mode: "edynsgate will debit X% (rent / car breakdown) plus processing
  of each paycheck deposited to ••1234, within [range]". Store acceptance (timestamp, IP, text version).
- Per-debit receipt email; out-of-range notice. Terms/Privacy updates. **Lawyer review gate.**

### Phase 5 — Collection engine
- For each `wages` (or admin-included) deposit: split by program rates → `withProcessingFee` → PaymentIntent
  `off_session: true, confirm: true, payment_method_types: ['us_bank_account']`, metadata
  `{ type: 'paycheck_collection', tenantId, depositId, program, rentCents, carCents }`,
  idempotency key `paycheck:<plaid_transaction_id>`.
- Guards: one collection per deposit (unique index), billing must be active (not paused), bank link healthy,
  mandate valid, per-day cap, never older than N days.
- Stripe webhook (route on `metadata.type`): `payment_intent.processing` / `succeeded` → ledger deposits or
  partner equity (same rules as `invoice.paid`) / `payment_failed` → mark failed, notify tenant + admin, no
  automatic retry storm; `charge.dispute.created` → stop paycheck mode (mandate invalid), alert admin.
- Shortfall cron, available rent funds, car trust period all keep working (they read the ledger).

### Phase 6 — Admin & tenant UI, switching modes
- Admin tenant page: bank link status, detected deposits (wages / review / ignored), collections and failures,
  include/ignore/retry, switch mode. Switching to paycheck mode **cancels the subscription** (no double
  collection); switching back re-creates it.
- Tenant dashboard: linked account, recent paychecks and what was collected from each.

### Phase 7 — Bank statements fallback (Plaid Statements)
For tenants whose **payroll can't be found** (Plaid Income returns nothing, or they're flagged for manual review):
- Admin clicks **"Request bank statements"** → tenant gets a portal prompt to approve Statements on their already
  linked bank (Plaid **update mode**, `products: ['statements']`, last ~3 months). Added only where needed because
  Plaid bills Statements per Item by months requested, even if never downloaded.
- Server lists + downloads the PDFs (`/statements/list`, `/statements/download`), validates `%PDF-` bytes, stores
  them **encrypted** in a `statements` collection (same model as `lib/paystubs.ts` / `lib/leases.ts`), admin-only
  no-store viewer route. Retention limit (e.g. delete after the review decision + N days).
- Admin review panel shows each month's PDF next to the **total deposits Plaid Transactions saw** that month (a
  cross-check), then records the verified monthly income with the existing manual-income form
  (`setVerifiedIncomeManually`).
- Unsupported bank (`PRODUCTS_NOT_SUPPORTED`) → fall back to the existing admin paystub upload.
- Reference: `docs/vendor/plaid-statements.md`.

#### 7b — AI-assisted statement reading (Claude API, decided 2026-11-14)
- New `lib/statement-reader.ts` (server-only) using the official `@anthropic-ai/sdk`, model `claude-opus-5-5`.
  Send the stored PDFs as base64 `document` blocks (32 MB / 600-page limits) and request **structured output**
  (`output_config.format` / `messages.parse`): every deposit line `{ date, amount, description, kind: 'pay' |
  'own_transfer' | 'refund' | 'other', confidence }` plus statement period + account mask.
- **Code does the math, not the model:** per-month totals and the average monthly deposit are summed in our code
  from the extracted lines, so any misread line is visible and correctable.
- Cross-check each month against Plaid Transactions deposit totals; flag differences above a threshold.
- **Human decision:** the admin review panel shows PDF + extracted lines + totals + flags; the admin confirms or
  corrects and saves verified income with `setVerifiedIncomeManually`. The AI never approves or sets amounts.
- Robustness: always check `stop_reason` (handle `refusal` → enable server-side `fallbacks: "default"` beta
  `server-side-fallback-2026-07-01`); validate the parsed output; any failure → plain manual review, never blocks
  the tenant. Runs on admin request (or automatically after statements arrive), once per statement set; cache the
  result with the statement record.
- Privacy/security: statements are sensitive PII sent to Anthropic for processing — disclose in Privacy, include
  in counsel review; consider a zero-data-retention agreement with Anthropic. Log ids + totals only, never
  statement content. Key in `ANTHROPIC_API_KEY` (Vercel env, never committed; local `.env.local`).
- Est. cost ≈ $0.10–$0.25 per tenant review (3 statements × ~5–10 pages at Opus 5.5 $4 / $20 per MTok).

### Phase 8 — Docs & verification
- README business rules, CODEMAP, memory notes.

## Verification (sandbox / test mode)
1. Link `user_transactions_dynamic` at First Platypus (`ins_109508`); confirm initial history is **not** charged.
2. `/sandbox/transactions/create` a payroll deposit → webhook → deposit classified `wages` → PaymentIntent created
   for the exact program % (+ fee) → `succeeded` → ledger/equity rows match.
3. Non-wage inflow → lands in `review`; admin include → collected once; re-sync → no duplicate.
4. Stripe test PMs: insufficient funds → failed path; dispute → paycheck mode stops.
5. Paused billing / unhealthy Item → no collection.
6. Effort Exchange tenant on `schedule` mode unchanged end to end.
7. Statements: sandbox Item → admin requests statements → tenant update-mode consent → mock PDF downloaded,
   stored encrypted, viewable only by admin; unsupported bank shows the paystub fallback.
8. AI reading: run on the sandbox mock statement and 2–3 real redacted samples; check every extracted line against
   the PDF, totals computed in code, Plaid cross-check flags a deliberate mismatch; API failure → manual review.

## Decisions (2026-11-14)
- **Same account only:** the paycheck account is both watched and debited; mask must match Stripe's last 4 (the
  tenant re-saves it in Stripe if needed). Mismatch → paycheck mode can't start.
- **What's collected:** see Phase 3 classification.
- **Self-employed:** all deposits collected automatically.
- **Rollout:** **paycheck mode is the default for new tenants** (once the feature flag is on); existing tenants
  switch when they link a bank. Fixed-schedule mode remains for tenants who can't link a bank.
- **Statements fallback:** Plaid Statements requested (2026-11-14) for tenants whose payroll can't be found;
  staff review PDF statements for total deposits (Phase 7).
- **AI statement reading:** Claude (Opus 5.5) extracts deposit lines; code totals; admin decides (Phase 7b).
  Needs `ANTHROPIC_API_KEY` (user obtaining it 2026-11-14).
- Still requires: Plaid Transactions **and Statements** production approval, lawyer review of the authorization +
  Terms.
