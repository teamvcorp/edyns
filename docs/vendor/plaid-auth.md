# Plaid Auth — integration notes

Source: https://plaid.com/docs/auth/#integration-process (fetched 2026-11-14). Re-check the live docs and the
API reference before coding against these — endpoint names/fields can change.

## How this relates to edynsgate (read first)

- **We do NOT use Plaid Auth today.** edynsgate uses **Plaid Income** (user tokens + payroll/bank income) only to
  *verify income* (`lib/plaid.ts`, `lib/income.ts`; README: "Plaid is the standard Income product, not CRA").
- **Bank payments are collected by Stripe**, not Plaid: the application-fee Checkout uses
  `payment_method_types: ['us_bank_account', 'card']` with `setup_future_usage: 'off_session'`, and Stripe's own
  bank verification saves the account for rent drafts. No account/routing numbers ever touch our servers.
- Auth would only matter if we wanted Plaid-verified bank accounts handed to Stripe
  (`/processor/stripe/bank_account_token/create`) instead of Stripe's built-in flow. If ever adopted, prefer the
  processor-token path (Step 4) so raw account numbers never reach us (least privilege, Nacha scope).

## What Auth is

Retrieves account + routing numbers for checking/savings/cash-management accounts for ACH/wire/RTP. Must be paired
with a payment processor (Plaid partner such as Stripe, or a third party), or use Plaid Transfer (US) instead.
Not for credit accounts or debit cards. Common companions: Balance, Signal (ACH return risk), Identity, Identity
Verification.

## Integration steps

1. **Link token** — `/link/token/create` with `auth` in `products`.
2. **Initialize Link** with the token. Recommended: Account Select "single select"; Embedded Institution Search for
   pay-by-bank alongside cards.
3. **Exchange** — `/item/public_token/exchange` → `access_token` (store encrypted; we use `lib/crypto.ts`).
4. **Partner path (recommended)** — enable the partner in Dashboard → Integrations, then
   `/processor/token/create`, or for Stripe `/processor/stripe/bank_account_token/create`; hand the token to the
   partner.
5. **Direct path** — `/auth/get` returns account/routing numbers for your own processor (brings Nacha obligations).
6. **`PENDING_DISCONNECT`** — send the Item through update mode within 7 days or consent expires (numbers may
   become invalid). On expiry: Item → `ITEM_LOGIN_REQUIRED` + `ITEM` / `ERROR` webhook (no separate expiry webhook).
7. **Revocation** — `USER_PERMISSION_REVOKED`, `USER_ACCOUNT_REVOKED`: update mode, or create a new Item. Using old
   numbers can cause ACH returns.
8. **Chase** — after consent expiry/revocation numbers must be regenerated: update mode, then re-call `/auth/get`
   or the processor endpoint. Simplest: always do this after a Chase Item goes through update mode.
9. *(optional)* **`AUTH` / `DEFAULT_UPDATE`** — rare account/routing number change; re-fetch and use only new values.
10. *(optional)* **More verification** — micro-deposits, database verification, Identity Match via the Account
    Verification Dashboard.

## Webhooks

| Webhook | Action |
|---|---|
| `PENDING_DISCONNECT` | Update mode within 7 days |
| `ITEM` / `ERROR` (`ITEM_LOGIN_REQUIRED`) | Consent expired → re-authenticate |
| `USER_PERMISSION_REVOKED` / `USER_ACCOUNT_REVOKED` | Update mode or new Item |
| `AUTH` / `DEFAULT_UPDATE` | Re-fetch numbers / processor token |

Always verify Plaid webhook signatures (we already do: `verifyPlaidWebhook` in `lib/plaid.ts`).

## Security & compliance

- **Tokenized account numbers (TANs)** at Chase, PNC, US Bank — check `is_tokenized_account_number`; valid for ACH
  and RTP only (not wire/checks). Use `persistent_account_id` to recognise accounts across Items.
- Show only the account **mask** in UIs.
- Raw numbers in the US fall under **Nacha** rules — another reason to prefer processor tokens.
- Call `/auth/get` only when needed. Billing is one-time per Item.

## Sandbox

- TAN behaviour: Chase `ins_56`, PNC `ins_13`, US Bank `ins_127990`, Platypus OAuth Bank `ins_127287`.
- Limited-purpose checking: "First Platypus Limited Purpose", `user_limited_purpose_checking` / `pass_good`; Link
  token needs `limited_purpose_types` (e.g. `RENT_MORTGAGE`) and the `limited purpose checking` subtype.
- Micro-deposit flows: see Plaid's Auth testing guide.
