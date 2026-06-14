# Stripe Identity (ID + selfie) verification — setup guide for an AI agent

This document describes, end to end, how the edynsgate app implements **Stripe Identity**
document + selfie verification, so you can replicate the same setup in a sister app.
It assumes a **Next.js (App Router) + a shared Stripe account** and a server-side session
+ user store. Replace the two app-specific pieces called out below with the sister app's
equivalents:

- **Auth/session** — here `getSession()` returns `{ sub: userId, role }`. Swap for the
  sister app's session/auth.
- **Persistence** — here the verification state is stored on the `tenants` collection
  (MongoDB). Swap for the sister app's user/profile store.

Everything else (Stripe API calls, the three routes, the webhook, the client trigger,
the redirect/return handling) can be copied almost verbatim.

---

## 1. What the flow does

1. The signed-in user clicks **Verify my identity**.
2. The app calls `POST /api/identity/start`, which creates a Stripe Identity
   **VerificationSession** (`type: 'document'`, `require_matching_selfie: true`) and returns
   its hosted `url`. The session id is saved on the user.
3. The browser is redirected to Stripe's hosted flow. The user uploads a government ID and
   takes a selfie.
4. Stripe redirects back to `return_url` (`/<portal>?identity=done`). On return the client
   calls `GET /api/identity/status`, which retrieves the session and, if `verified`,
   persists the result (and the ID's last 4) for instant feedback.
5. Independently, Stripe sends an **`identity.verification_session.verified`** webhook to
   `POST /api/identity/webhook` — the **source of truth**, covering users who close the tab
   before the redirect. It persists the same result.

Two paths (status check on return + webhook) make the result reliable regardless of whether
the user makes it back to the app.

---

## 2. Stripe dashboard setup

1. **Enable Identity**: Stripe Dashboard → **Identity** → activate it (and complete any
   business verification Stripe requires). Test mode works immediately.
2. **API keys**: Developers → API keys. You need the **Secret key** (`sk_test_…` / `sk_live_…`)
   and the **Publishable key** (`pk_…`, only if the sister app uses Stripe.js elsewhere).
3. **Webhook endpoint**: Developers → Webhooks → **Add endpoint**.
   - URL: `https://<your-domain>/api/identity/webhook`
   - Events: **`identity.verification_session.verified`** (optionally also
     `identity.verification_session.requires_input` and `…​.processing` if you want to
     surface those states).
   - Copy the endpoint's **Signing secret** (`whsec_…`).
   - You may reuse your existing payments webhook endpoint/secret instead of a dedicated one
     — the code falls back to `STRIPE_WEBHOOK_SECRET` when no Identity-specific secret is set.
4. **Local testing**: use the Stripe CLI —
   `stripe listen --forward-to localhost:3000/api/identity/webhook` (it prints a `whsec_…`
   to use locally), and `stripe trigger identity.verification_session.verified`.

---

## 3. Environment variables

```bash
STRIPE_SECRET_KEY=sk_test_...                  # required
NEXT_PUBLIC_BASE_URL=https://your-domain.com   # used to build return_url (no trailing slash)
STRIPE_WEBHOOK_SECRET=whsec_...                # payments webhook secret (also the Identity fallback)
STRIPE_IDENTITY_WEBHOOK_SECRET=whsec_...       # OPTIONAL: dedicated Identity endpoint secret
```

If you put Identity on its own webhook endpoint, set `STRIPE_IDENTITY_WEBHOOK_SECRET`.
Otherwise the webhook route uses `STRIPE_WEBHOOK_SECRET`.

---

## 4. Shared Stripe client

A lazily-instantiated singleton so `next build` never needs the key at import time:

```ts
// lib/stripe.ts
import 'server-only'
import Stripe from 'stripe'

let client: Stripe | null = null
export function getStripe(): Stripe {
  if (client) return client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY environment variable')
  client = new Stripe(key)
  return client
}
```

---

## 5. Persistence (adapt to the sister app's user store)

Persist these fields on the user/profile record:

| Field                      | Type    | Purpose                                              |
| -------------------------- | ------- | ---------------------------------------------------- |
| `stripeIdentitySessionId`  | string  | The VerificationSession id (`vs_…`), set at start.   |
| `identityVerified`         | boolean | Set true once verified.                              |
| `identityVerifiedAt`       | Date    | When it verified.                                    |
| `idNumberLast4`            | string  | Last 4 of the ID number (optional; never store more).|

Two write helpers (MongoDB shown; adapt to your store):

```ts
// set at start
export async function setIdentitySession(userId: string, sessionId: string): Promise<void> {
  await users.updateOne({ _id: id(userId) }, { $set: { stripeIdentitySessionId: sessionId, updatedAt: new Date() } })
}

/**
 * Persist a verified result. Located by userId (from session metadata) when
 * available, otherwise by the verification session id (webhook fallback).
 */
export async function markIdentityVerified(opts: { userId?: string; sessionId?: string; last4?: string }): Promise<void> {
  const filter =
    opts.userId ? { _id: id(opts.userId) }
    : opts.sessionId ? { stripeIdentitySessionId: opts.sessionId }
    : null
  if (!filter) return
  const set: Record<string, unknown> = { identityVerified: true, identityVerifiedAt: new Date(), updatedAt: new Date() }
  if (opts.last4) set.idNumberLast4 = opts.last4
  await users.updateOne(filter, { $set: set })
}
```

> **Important:** store only the **last 4** of the ID number, never the full value.

---

## 6. Route 1 — start a session: `POST /api/identity/start`

```ts
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getStripe } from '@/lib/stripe'
import { setIdentitySession } from '@/lib/users'

const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export async function POST(): Promise<NextResponse> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const vs = await getStripe().identity.verificationSessions.create({
      type: 'document',
      metadata: { userId: session.sub },          // links the webhook back to this user
      options: { document: { require_matching_selfie: true } },
      return_url: `${baseUrl}/dashboard?identity=done`,
    })
    await setIdentitySession(session.sub, vs.id)
    return NextResponse.json({ url: vs.url })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Stripe error' }, { status: 502 })
  }
}
```

Key points: `metadata.userId` is what lets the webhook map the result back to a user;
`return_url` is where Stripe sends the user afterward (carry an `?identity=done` flag).

---

## 7. Route 2 — instant status on return: `GET /api/identity/status`

```ts
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getStripe } from '@/lib/stripe'
import { getUserById, markIdentityVerified } from '@/lib/users'

export async function GET(): Promise<NextResponse> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getUserById(session.sub)
  if (user?.identityVerified) return NextResponse.json({ status: 'verified', identityVerified: true })
  if (!user?.stripeIdentitySessionId) return NextResponse.json({ status: 'none', identityVerified: false })

  try {
    const vs = await getStripe().identity.verificationSessions.retrieve(user.stripeIdentitySessionId, {
      expand: ['verified_outputs'],
    })
    if (vs.status === 'verified') {
      const outputs = vs.verified_outputs as { id_number?: string | null } | null
      const last4 = outputs?.id_number ? outputs.id_number.replace(/\D/g, '').slice(-4) : undefined
      await markIdentityVerified({ userId: session.sub, last4 })
      return NextResponse.json({ status: 'verified', identityVerified: true })
    }
    return NextResponse.json({ status: vs.status, identityVerified: false })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Stripe error' }, { status: 502 })
  }
}
```

---

## 8. Route 3 — webhook (source of truth): `POST /api/identity/webhook`

```ts
import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { markIdentityVerified } from '@/lib/users'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sig = req.headers.get('stripe-signature')
  const secret = process.env.STRIPE_IDENTITY_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET
  if (!sig || !secret) return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 })

  const raw = await req.text() // raw body REQUIRED for signature verification
  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'identity.verification_session.verified') {
    const vs = event.data.object as Stripe.Identity.VerificationSession
    try {
      let last4: string | undefined
      try {
        const full = await getStripe().identity.verificationSessions.retrieve(vs.id, { expand: ['verified_outputs'] })
        const outputs = full.verified_outputs as { id_number?: string | null } | null
        if (outputs?.id_number) last4 = outputs.id_number.replace(/\D/g, '').slice(-4)
      } catch {
        /* last 4 is optional */
      }
      await markIdentityVerified({ userId: vs.metadata?.userId, sessionId: vs.id, last4 })
    } catch (err) {
      console.error('Identity webhook error:', err)
      // Return 200 anyway so Stripe doesn't retry forever; the status route is the fallback.
    }
  }

  return NextResponse.json({ received: true })
}
```

Webhook gotchas:
- **Use the raw request body** (`await req.text()`) for `constructEvent` — never the parsed
  JSON, or signature verification fails. (In App Router route handlers `req.text()` gives the
  raw body; do not add body parsing.)
- Always **verify the signature** before trusting the event.
- Return **200** even on internal errors so Stripe stops retrying; the status route backstops.
- Locate the user by `metadata.userId` first, falling back to the session id.

---

## 9. Client trigger (React, `'use client'`)

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/** Starts a Stripe Identity session and handles the return (?identity=done). */
export function IdentityVerifyButton({ returning = false }: { returning?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // On return from Stripe, persist the result then drop the query param.
  useEffect(() => {
    if (!returning) return
    fetch('/api/identity/status').finally(() => router.replace('/dashboard'))
  }, [returning, router])

  async function start() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/identity/start', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start verification.')
      window.location.href = data.url   // redirect to Stripe's hosted flow
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start verification.')
      setBusy(false)
    }
  }

  return (
    <button onClick={start} disabled={busy}>
      {busy ? 'Starting…' : returning ? 'Checking…' : 'Verify my identity'}
    </button>
  )
}
```

Render it with `returning={searchParams.identity === 'done'}` on the page Stripe returns to,
so it auto-runs the status check and cleans the URL.

---

## 10. Gating on verification

Wherever the sister app needs a verified identity (e.g. before some privileged action),
check the persisted `identityVerified` flag server-side — never trust the client. In this
app, for example, a tenant cannot be approved until `identityVerified` is true.

---

## 11. Verification checklist

1. `STRIPE_SECRET_KEY` set; Identity enabled on the Stripe account.
2. Webhook endpoint added for `identity.verification_session.verified`; its `whsec_…` in env.
3. Click **Verify my identity** → redirected to Stripe's hosted flow.
4. In test mode, complete the flow (Stripe provides test document images).
5. On return, the page's status check flips the user to verified; the webhook does the same
   independently (test with `stripe trigger identity.verification_session.verified` or the CLI
   forwarding).
6. Confirm the user record shows `identityVerified: true` and `idNumberLast4` populated.
7. Confirm any gated action now allows the verified user through.
