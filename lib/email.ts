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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
