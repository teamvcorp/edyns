# Stripe Connect transfers & webhook events (local reference)

Why this exists: every transfer to a partner's connected account must be auto-logged
as a debit against their equity balance (`payouts` collection). The webhook is the
catch-all — it also records transfers made directly in the Stripe Dashboard and acts
as a safety net when an in-app transfer succeeded but the action's DB write failed.

## Transfer object (fields we use)

From `stripe.transfers.create` responses and `transfer.*` webhook events
(`Stripe.Transfer`, see node_modules/stripe/types/Transfers.d.ts):

| Field | Notes |
|---|---|
| `id` | `tr_…` — our idempotency key for debit rows (unique sparse index on `payouts.stripeTransferId`) |
| `amount` | cents |
| `currency` | always `usd` for us |
| `destination` | connected account — `acct_…` string, or an expanded object (`.id`) |
| `metadata.payoutId` | set by `approvePayoutAction` → webhook settles that existing request row |
| `metadata.partnerId` | set by both in-app actions → webhook resolves partner without a DB-by-account lookup |
| `created` | unix seconds — used as the recorded paidAt for external transfers |
| `reversed` / `amount_reversed` | `transfer.reversed` fires only when the FULL amount is reversed; partial reversals only update `amount_reversed` (out of scope) |

Dashboard-made transfers carry **no metadata** → partner is resolved via
`findPartnerByStripeAccountId(destination)` (lib/users.ts, sparse index on
`stripeAccountId`). No partner match → event ignored.

## Events handled (app/api/stripe/webhook/route.ts)

- `transfer.created` → settle by `metadata.payoutId`, else insert a `paid` payout
  row with `source: 'external'`. All writes idempotent (status-filtered update /
  unique transfer-id insert with E11000 swallowed).
- `transfer.reversed` → flip the matching `paid` row to `reversed`; it drops out
  of `totalPaidCentsByPartner`, restoring the partner's available balance.

Transfer events are delivered to the **platform account's** normal webhook
endpoint — same endpoint and `STRIPE_WEBHOOK_SECRET`, no Connect endpoint needed.

## Idempotency keys on transfers.create

Passed as the 2nd argument: `{ idempotencyKey }`. Stripe caches by key for ~24h and
replays the same transfer instead of creating a new one.

- Approve payout: `payout_<payoutId>` (exact — a double-click can never double-pay).
- Force payout: `force_<partnerId>_<availableCents>` (double-click safe; an
  identical re-force within 24h returns the cached transfer — safe, never double-pays).

## REQUIRED Stripe Dashboard setup (one-time, manual)

Developers → Webhooks → the existing endpoint (`/api/stripe/webhook`) →
**add events `transfer.created` and `transfer.reversed`**. Without this, external
transfers are not auto-logged (in-app transfers are still recorded synchronously).
