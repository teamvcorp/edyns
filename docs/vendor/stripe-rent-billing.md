# Stripe — rent billing behaviours this app relies on

Local notes so we don't re-research. Verified 2026-11-01 against the installed SDK types
(`stripe@18.5.0`, API `2025-08-27.basil`, `node_modules/stripe/types/*`) plus Stripe's documented behaviour.
Re-verify if the SDK major version changes.

## Where things live (basil API)
- The current period end is on the subscription ITEM: `sub.items.data[0].current_period_end`
  (no longer on the subscription object). Used by `lib/revenue.ts`, `lib/stripe.ts`.
- An invoice's subscription id: `invoice.parent.subscription_details.subscription` on new API versions,
  `invoice.subscription` on older ones → use `invoiceSubscriptionId()` in `lib/stripe.ts`.

## Changing rent amount / frequency / date — `adjustRentSubscription()` (lib/stripe.ts)
- **Prices are immutable.** To change the amount or interval, create a new recurring Price on the same Product
  and update the subscription item: `items: [{ id: <itemId>, price: <newPriceId> }]`.
- **`proration_behavior: 'none'`** — no partial charge/credit for the current period.
- **Moving the next charge date:** `billing_cycle_anchor` on update only accepts `'now'` / `'unchanged'`.
  Setting **`trial_end: <unix ts>`** on an existing subscription is the supported way to push the next charge to a
  chosen date: nothing is charged until then and the cycle re-anchors on that date (SDK doc: "The
  billing_cycle_anchor will be updated to the trial_end value… Can be at most two years from billing_cycle_anchor").
  The subscription status becomes `trialing` until then — our webhook maps `trialing` → `active`.
  Starting a trial generates a **$0 invoice**; the equity webhook ignores zero-total invoices.
- Changing the interval WITHOUT a trial_end would reset the anchor to "now" and invoice immediately — we always
  pass trial_end, so that never happens.
- `pause_collection` is untouched by these updates.

## Canceled subscriptions
- A canceled subscription is final in Stripe — it cannot be resumed/reactivated. "Restart" = create a new
  subscription for the same customer (`createRentSubscription()`).
- Before creating, check the old one really ended (`subscriptionEnded()`): status `canceled` / `incomplete_expired`,
  or `resource_missing` on retrieve. Anything else → refuse (otherwise two live subscriptions = double charging).

## Credits for payments made outside Stripe — `addCustomerCredit()` (lib/stripe.ts)
- `stripe.customers.createBalanceTransaction(customerId, { amount, currency, description, metadata })`.
- **Negative `amount` = credit** to the customer (Stripe stores credit as a negative `customer.balance`).
- Customer balance is applied automatically to the customer's next finalized invoice(s); `amount_due` drops by the
  credit (can reach $0); leftover credit carries to later invoices. Invoice fields `starting_balance` /
  `ending_balance` show how much was applied.
- An invoice fully covered by credit still transitions to `paid` and fires `invoice.paid` (amount_paid = 0).
  → The equity webhook keys on `invoice.status === 'paid' && invoice.total > 0`, not `amount_paid`.

## Idempotency
- Every mutating call from an admin form passes `{ idempotencyKey }` derived from a one-time form nonce
  (`randomUUID()` rendered into the form). Stripe replays the original response for a repeated key (24h), so a
  double-submit can't create two credits/prices. Our local audit write (`recordRentCredit`) is also idempotent on
  the Stripe transaction id.

## Fees
- Tenant covers processing: charge = `withProcessingFee(base)` = ceil((base + 30¢) / (1 − 2.9%)) (`lib/fees.ts`).
  Example: base $720.00 → charged $741.82 → Stripe ≈ $21.81 → platform keeps $720.
