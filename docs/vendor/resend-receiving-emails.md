# Resend — Receiving (inbound) emails · notes

Source: https://resend.com/docs (Receiving Emails) · index: https://resend.com/docs/llms.txt
Saved: 2026-07-03. Verify against live docs before relying on specifics.

## What "receiving" is
Resend can accept **inbound** email for a receiving domain, parse it (+ attachments),
and POST an `email.received` webhook to an endpoint you choose. Separate feature
from **sending** — enabling one does not enable the other.

## Setup (if we ever want it)
1. Use a Resend-managed `<id>.resend.app` domain, OR add a **custom domain** with an
   `MX` record.
2. Add a Webhook (dashboard) for event type `email.received` pointing at a `POST` route.
3. Route handler reads `event.type === 'email.received'`; **body/headers/attachments are
   NOT in the webhook** — only metadata. Fetch them via the Received-emails API
   (`/api-reference/emails/retrieve-received-email`) and Attachments API. (This keeps
   payloads small for serverless body-size limits.)
4. **Verify webhook signatures** (svix headers `svix-id`/`svix-timestamp`/`svix-signature`)
   with `resend.webhooks.verify({ payload, headers, webhookSecret: RESEND_WEBHOOK_SECRET })`.
   Same pattern as our existing Stripe/Plaid webhook signature checks.

## CRITICAL best-practice caveat for fyht4.com
- Adding Resend's `MX` to the **root** `fyht4.com` would capture **ALL** mail for the
  domain and break its existing mailbox service. fyht4.com already sends real mail
  (`FROM_EMAIL=noreply@fyht4.com`), so it almost certainly has existing MX.
- Docs' own guidance: if root MX exists, **use a subdomain** (e.g. `inbound.fyht4.com`)
  for Resend receiving, or set forwarding rules in the existing provider. Never point
  root MX at Resend on a domain with live mail.

## Do we need receiving for project invoices? — NO
The invoice flow is **link-driven**: partners accept/decline/pay via the tokenized
`/invoices/[token]` page, not by replying to email. No inbound processing is required
for the feature to work end-to-end.

## The only real gap: where do replies go?
`From` is `billing@fyht4.com`. If a partner clicks "Reply":
- Best practice (zero code): ensure `billing@fyht4.com` is a **real monitored mailbox
  or alias** in fyht4.com's existing mail provider.
- Optional (small code): set a Resend `reply_to` on invoice sends pointing at a
  monitored ops/support inbox. Our `sendEmail()` would need a `reply_to` field added
  to the Resend POST body (`{ from, to, subject, html, reply_to }`).

Decision (2026-07-03): shipped **send-only** from `billing@fyht4.com`. Inbound not set
up. Revisit `reply_to` / Resend Receiving only if we want to programmatically handle
partner replies.
