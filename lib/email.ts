import 'server-only'

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

/** Send an email via the Resend REST API (no SDK dependency). */
export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.FROM_EMAIL
  if (!key || !from) throw new Error('Email is not configured (RESEND_API_KEY / FROM_EMAIL)')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html }),
  })
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`)
}

/**
 * Credentials email for an admin-created account: temp password + sign-in link.
 * Tenants are told their first step is to sign in and pay the application fee.
 */
export async function sendCredentialsEmail(input: {
  to: string
  name: string
  tempPassword: string
  role: 'tenant' | 'partner'
}): Promise<void> {
  const loginUrl = `${baseUrl}/${input.role === 'tenant' ? 'tenants' : 'partners'}/login`
  const firstStep =
    input.role === 'tenant'
      ? `<p>Your first step is to <strong>sign in and pay the $25 application fee</strong>. Your application stays pending until the fee is paid and an admin approves it.</p>`
      : `<p>Sign in to access your partner portal.</p>`

  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;color:#2b2b25;line-height:1.6">
      <h2 style="font-weight:600">Welcome to edynsgate, ${escapeHtml(input.name)}</h2>
      <p>An account has been created for you. Use these credentials to sign in:</p>
      <p style="background:#f3f3ee;border-radius:8px;padding:12px 16px">
        <strong>Email:</strong> ${escapeHtml(input.to)}<br/>
        <strong>Temporary password:</strong> ${escapeHtml(input.tempPassword)}
      </p>
      ${firstStep}
      <p><a href="${loginUrl}" style="display:inline-block;background:#26301b;color:#fff;border-radius:9999px;padding:10px 18px;text-decoration:none">Sign in</a></p>
      <p style="color:#6b6b60;font-size:13px">For your security, please change your password after signing in.</p>
    </div>`

  await sendEmail({ to: input.to, subject: 'Your edynsgate account', html })
}

/**
 * Welcome-back / account-recovery email: issues a fresh temporary password and a
 * sign-in link. Sent when an admin sets up an imported user or refreshes someone
 * who missed steps or lost their password. The user is prompted to choose a new
 * password the moment they sign in.
 */
export async function sendWelcomeBackEmail(input: {
  to: string
  name: string
  tempPassword: string
  role: 'tenant' | 'partner'
}): Promise<void> {
  const loginUrl = `${baseUrl}/${input.role === 'tenant' ? 'tenants' : 'partners'}/login`
  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;color:#2b2b25;line-height:1.6">
      <h2 style="font-weight:600">Welcome back, ${escapeHtml(input.name)}</h2>
      <p>We’ve set a temporary password on your edynsgate account so you can sign in:</p>
      <p style="background:#f3f3ee;border-radius:8px;padding:12px 16px">
        <strong>Email:</strong> ${escapeHtml(input.to)}<br/>
        <strong>Temporary password:</strong> ${escapeHtml(input.tempPassword)}
      </p>
      <p>When you sign in you’ll be asked to <strong>choose a new password</strong> before continuing.</p>
      <p><a href="${loginUrl}" style="display:inline-block;background:#26301b;color:#fff;border-radius:9999px;padding:10px 18px;text-decoration:none">Sign in</a></p>
      <p style="color:#6b6b60;font-size:13px">If you didn’t expect this email, please contact us.</p>
    </div>`

  await sendEmail({ to: input.to, subject: 'Your edynsgate sign-in details', html })
}

/**
 * Approval email: the tenant is approved and must finish income verification
 * (connect a bank via Plaid OR upload their most recent paystub) before we set
 * up rent collection.
 */
export async function sendApprovalEmail(input: { to: string; name: string }): Promise<void> {
  const portalUrl = `${baseUrl}/tenants`
  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;color:#2b2b25;line-height:1.6">
      <h2 style="font-weight:600">You’re approved, ${escapeHtml(input.name)} 🎉</h2>
      <p>Welcome to edynsgate. There’s <strong>one last step</strong> before you can move in: verify your income.</p>
      <p>Sign in to your tenant portal and either:</p>
      <ul>
        <li><strong>Connect your bank with Plaid</strong> (fastest), or</li>
        <li><strong>Upload your most recent paystub</strong>.</li>
      </ul>
      <p>Once we’ve confirmed your income, our team will set up your rent collection.</p>
      <p><a href="${portalUrl}" style="display:inline-block;background:#26301b;color:#fff;border-radius:9999px;padding:10px 18px;text-decoration:none">Finish income verification</a></p>
    </div>`

  await sendEmail({ to: input.to, subject: 'You’re approved — one last step', html })
}

/**
 * Internal security alert (e.g., suspicious bank-link velocity). Sent to
 * ALERT_EMAIL, falling back to FROM_EMAIL. Best-effort — callers should not let
 * a failed alert break the user flow.
 */
export async function sendSecurityAlert(input: { subject: string; body: string }): Promise<void> {
  const to = process.env.ALERT_EMAIL ?? process.env.FROM_EMAIL
  if (!to) return
  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;color:#2b2b25;line-height:1.6">
      <h2 style="font-weight:600">Security alert</h2>
      <p>${escapeHtml(input.body)}</p>
      <p style="color:#6b6b60;font-size:13px">Automated alert from edynsgate.</p>
    </div>`
  await sendEmail({ to, subject: `[edynsgate security] ${input.subject}`, html })
}

/** Partner equity report for one property: YTD + lifetime totals and a line per payment. */
export async function sendEquityReportEmail(input: {
  to: string
  name: string
  propertyLabel: string
  entries: { source: string; rentCents: number; sharePercent: number; equityCents: number; paidAt: Date }[]
  ytdCents: number
  lifetimeCents: number
}): Promise<void> {
  const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`
  const year = new Date().getFullYear()
  const rows =
    input.entries.length === 0
      ? `<tr><td colspan="5" style="padding:8px;color:#6b6b60">No rent equity recorded yet.</td></tr>`
      : input.entries
          .map(
            (e) => `
        <tr>
          <td style="padding:6px 8px;border-top:1px solid #e5e5dd">${new Date(e.paidAt).toLocaleDateString()}</td>
          <td style="padding:6px 8px;border-top:1px solid #e5e5dd;text-transform:capitalize">${escapeHtml(e.source)}</td>
          <td style="padding:6px 8px;border-top:1px solid #e5e5dd;text-align:right">${usd(e.rentCents)}</td>
          <td style="padding:6px 8px;border-top:1px solid #e5e5dd;text-align:right">${e.sharePercent}%</td>
          <td style="padding:6px 8px;border-top:1px solid #e5e5dd;text-align:right">${usd(e.equityCents)}</td>
        </tr>`,
          )
          .join('')

  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;color:#2b2b25;line-height:1.6">
      <h2 style="font-weight:600">Equity report — ${escapeHtml(input.propertyLabel)}</h2>
      <p>Hi ${escapeHtml(input.name)}, here’s the equity this property has generated from rent.</p>
      <p style="background:#f3f3ee;border-radius:8px;padding:12px 16px">
        <strong>Year to date (${year}):</strong> ${usd(input.ytdCents)}<br/>
        <strong>All time:</strong> ${usd(input.lifetimeCents)}
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <thead>
          <tr style="text-align:left;color:#6b6b60">
            <th style="padding:6px 8px">Date</th>
            <th style="padding:6px 8px">Method</th>
            <th style="padding:6px 8px;text-align:right">Rent</th>
            <th style="padding:6px 8px;text-align:right">Share</th>
            <th style="padding:6px 8px;text-align:right">Equity</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#6b6b60;font-size:13px">Equity accrues from each rent payment while the property is rented.</p>
    </div>`

  await sendEmail({ to: input.to, subject: `Equity report — ${input.propertyLabel}`, html })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
