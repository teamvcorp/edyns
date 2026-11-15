# Stripe ACH Direct Debit — off-session, variable-amount debits

Sources (fetched 2026-11-14): https://docs.stripe.com/payments/ach-direct-debit and
https://docs.stripe.com/payments/ach-direct-debit/set-up-payment (Direct API). Re-check before coding.
Legal points (Nacha + Reg E) and our authorization approach were reviewed by counsel on 2026-11-14.

## Saved bank account → later debits

- We already save the tenant's `us_bank_account` via Checkout with `setup_future_usage: 'off_session'` (application
  fee) — Stripe shows/stores the mandate for Checkout flows.
- Later debit (Customers v1): `paymentIntents.create({ amount, currency: 'usd', customer, payment_method,
  payment_method_types: ['us_bank_account'], off_session: true, confirm: true, metadata, statement_descriptor? },
  { idempotencyKey })`. (Docs' example uses `automatic_payment_methods` + `return_url`; for off-session ACH we pin
  `payment_method_types` — **VERIFY** at build time.)
- Minimum amount **$0.50**. Dynamic `statement_descriptor` truncates to 16 chars.

## Timing & events

- Delayed notification: PaymentIntent goes `processing` → `succeeded` or `payment_failed`, up to **4 business days**
  (T+4; T+2 "faster settlement" if eligible). Test mode settles instantly.
- Events: `payment_intent.processing`, `payment_intent.succeeded`, `payment_intent.payment_failed`,
  `charge.dispute.created` (incl. late returns after `succeeded`: reasons `insufficient_funds`,
  `incorrect_account_details`, `bank_cannot_process`), `payment_method.automatically_updated` (bank blocked).
- Refunds: full only, up to 180 days, ~3 business days.

## Disputes & mandates

- Consumers can dispute up to **60 calendar days**; disputes are final, no evidence/appeal.
- A dispute **invalidates the mandate** — stop debiting; a second dispute → Stripe blocks the bank account.
- Customer may revoke the mandate any time (detach the PaymentMethod).

## Authorization requirements (why per-paycheck needs a new consent step)

- Stripe: "If you originate recurring preauthorized debits, you must disclose to your customers **how these amounts
  are calculated or a range** the customer can anticipate", and give **≥7 days notice** before changing debit timing.
- Payments outside the authorized debits need fresh authorization.
- Must give the customer a copy of the mandate (Stripe emails it for Checkout-collected mandates).
- US Reg E (12 CFR 1005.10(d)) — variable-amount preauthorized transfers: notice of amount + date ≥10 days before,
  **unless** the consumer elects to be notified only when an amount falls outside a range they specified.
  → Plan: in-app authorization stating "X% of each paycheck deposited to account ••1234", tenant sets/accepts a
  per-debit range; we email a receipt for every debit and a notice whenever one falls outside the range.
  **Reviewed by counsel 2026-11-14.**

## Test bank accounts (manual entry, routing 110000000)

`000123456789` success · `000222222227` insufficient funds · `000333333335` debit not authorized ·
`000555555559` dispute · `000000000009` stays processing. Tokens: `pm_usBankAccount_success`, etc.
