# Plaid Statements — integration notes (income fallback)

Source: https://plaid.com/docs/statements/ (fetched 2026-11-14). Re-check the API reference before coding;
**VERIFY** marks gaps in the fetched text.

## What it is

Bank-branded **PDF** statements pulled directly from the bank, up to **2 years**, US **depository** accounts only
(checking/savings). Not every institution is covered (named: BofA, Citi, Fifth Third, Huntington, Navy FCU, Regions,
Truist, US Bank, Wells Fargo; Chase early access) → always keep the paystub/manual fallback.

Our use (decided 2026-11-14): for tenants whose **payroll can't be found** through Plaid Income, pull their bank
statements so staff can review **total deposits**. Requested from Plaid alongside Transactions.

## Link

- `/link/token/create` with a `statements: { start_date, end_date }` object (ISO dates).
- Statements-only: `products: ['statements']`. With other products: put `statements` in
  `required_if_supported_products` → unsupported institutions still link; Statements calls then return
  `PRODUCTS_NOT_SUPPORTED`.
- **Add to an existing Item (update mode):** `/link/token/create` with that Item's `access_token` and
  `products: ['statements']` — user sees just a consent step if they linked < 2 years ago.

## Endpoints (backend only)

- `/statements/list` (`access_token`) → `accounts[]` { `account_id`, `account_mask`, `account_name`,
  `account_official_name`, `account_type`, `account_subtype`, `statements[]` { `statement_id`, `month`, `year` } },
  `institution_id`, `institution_name`, `item_id`. (`date_posted` — **VERIFY**.)
- `/statements/download` (`access_token`, `statement_id`) → the **PDF bytes** as the bank provides. Sandbox returns a
  mock statement.
- `/statements/refresh` (optional, paid per request) → `STATEMENTS_REFRESH_COMPLETE` webhook, then list again.

## Billing (important for design)

- Charged **per Item**, scaled by the number of statements in the requested date range — **even if we never call
  the Statements endpoints**. → Only add Statements to the Items that need it (update mode when payroll isn't
  found), and request only the months we need (e.g. last 3).
- Refresh: per request.

## Security

- PDFs are sensitive financial PII → handle like paystubs/leases: validate bytes (`checkUpload`/`sniffFileType`
  = `%PDF-`), encrypt at rest (`encryptBuffer`), no public URL, admin-only no-store viewer route, log access by id
  only, set a retention period.
- Verify webhook signatures before acting on `STATEMENTS_REFRESH_COMPLETE`.
