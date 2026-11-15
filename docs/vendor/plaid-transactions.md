# Plaid Transactions — integration notes (for per-paycheck collection)

Sources (fetched 2026-11-14): https://plaid.com/docs/transactions/ and
https://plaid.com/docs/api/products/transactions/ — re-check before coding; items marked **VERIFY** were not in
the fetched text.

## Why we need it

Today we use only Plaid **Income** (payroll or bank-income connections) to *verify* income. Employees link their
**payroll provider**, not their bank, so there is no bank Item to watch. Per-paycheck collection needs a separate
**bank** Item linked with the `transactions` product. Requires Plaid production approval for Transactions.

## Link + setup

1. `/link/token/create` with `products: ['transactions']`, our `webhook`, optional
   `transactions.days_requested` (default 90, max 730). OAuth banks need `redirect_uri`.
2. Exchange `public_token` → `access_token` via `/item/public_token/exchange` (store encrypted, `lib/crypto.ts`).
3. Call `/transactions/sync` with **no cursor** once — this activates webhooks for the Item (first response is
   often empty).
4. React to `SYNC_UPDATES_AVAILABLE` webhooks by calling sync from the stored cursor.

## `/transactions/sync`

- Request: `access_token`, `cursor` (omit first time; ≤256 chars), `count` (1–500, default 100),
  `options.personal_finance_category_version` (`v1`/`v2`), `options.days_requested`, `options.account_id`
  (separate cursor stream per account), `options.include_original_description`.
- Response: `added`, `modified`, `removed` (`transaction_id` + `account_id`), `next_cursor`, `has_more`,
  `transactions_update_status` (`NOT_READY` / `INITIAL_UPDATE_COMPLETE` / `HISTORICAL_UPDATE_COMPLETE` / `UNKNOWN`),
  `accounts`, `request_id`.
- Loop while `has_more`; persist `next_cursor` only after the full run. On
  `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` restart from the run's **starting** cursor.

## Transaction fields we use

- `amount`: **positive = money OUT, negative = money IN** → a paycheck is negative.
- `pending` (pending details can change) and `pending_transaction_id` (links posted → pending). Act on **posted**
  transactions only.
- `transaction_id`, `account_id`, `date` (posted), `authorized_date`, `merchant_name` (`name` deprecated),
  `payment_channel`.
- `personal_finance_category.primary` / `.detailed` / `.confidence_level`. Payroll is expected under
  `INCOME` / `INCOME_WAGES` — **VERIFY** against Plaid's PFC taxonomy CSV.
- `counterparties[].type` includes `income_source` (the payer of income) — a second payroll signal.

## Webhooks

- `SYNC_UPDATES_AVAILABLE` (`initial_update_complete`, `historical_update_complete` flags) — new data; call sync.
  Payload fields beyond these — **VERIFY** in the webhooks reference.
- `RECURRING_TRANSACTIONS_UPDATE` (Recurring add-on only).
- Item health (shared with Auth): `ITEM` / `ERROR` (`ITEM_LOGIN_REQUIRED`), `PENDING_DISCONNECT`,
  `USER_PERMISSION_REVOKED` → send through update mode. Always verify webhook signatures (`verifyPlaidWebhook`).

## Freshness & billing

- Institutions are checked ~1–4×/day → a paycheck is usually seen the same day it posts, sometimes next day.
- `/transactions/refresh` (on-demand) is a paid add-on requiring access approval.
- Transactions is billed as a **subscription per Item** — remove Items we no longer need (`/item/remove`).

## Sandbox

- User `user_transactions_dynamic` (any password) at a non-OAuth bank e.g. First Platypus `ins_109508`.
- `/sandbox/transactions/create` injects custom transactions (e.g. a negative-amount payroll deposit).
- `/sandbox/item/fire_webhook` to test handlers; `/transactions/refresh` in sandbox creates new pending/posted rows.
- Personas with realistic cadence: `user_ewa_user`, `user_yuppie`, `user_small_business`.

## Alternative noted

Stripe **Financial Connections** can also expose transactions (permission `transactions`) on the same bank
account we debit, avoiding a second bank link. Not chosen (decision 2026-11-14: Plaid Transactions), kept here in
case Plaid approval stalls.
