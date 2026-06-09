'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/dal'
import {
  getTenantByUserId,
  savePlaidVerification,
  recordPlaidLink,
  flagTenantForReview,
} from '@/lib/tenants'
import { exchangePublicToken, getMonthlyIncome } from '@/lib/plaid'
import { encryptString } from '@/lib/crypto'
import { sendSecurityAlert } from '@/lib/email'

export type PlaidResult = { ok?: boolean; error?: string }

// Bank-link velocity monitoring: flag for review past the soft threshold, block past the hard cap.
const PLAID_LINK_REVIEW_THRESHOLD = 4
const PLAID_LINK_HARD_CAP = 8

/** Finalize a Plaid Link: store the (encrypted) access token and verified income. */
export async function completePlaidLink(publicToken: string): Promise<PlaidResult> {
  const session = await requireRole('tenant', '/tenants/login')
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant) return { error: 'No application found.' }

  // Count this link attempt up front so the cap can't be bypassed by failures.
  const linkCount = await recordPlaidLink(session.sub)
  if (linkCount > PLAID_LINK_HARD_CAP) {
    await flagTenantForReview(session.sub, `Exceeded bank-link cap (${linkCount} attempts)`)
    try {
      await sendSecurityAlert({
        subject: 'Tenant blocked for excessive bank linking',
        body: `Tenant ${tenant.name} (${tenant.email}) exceeded the bank-link cap with ${linkCount} attempts and was blocked pending review.`,
      })
    } catch {
      /* alert is best-effort */
    }
    return { error: 'For your security, bank linking is paused on this account. Our team will reach out.' }
  }

  try {
    const { accessToken, itemId } = await exchangePublicToken(publicToken)
    const income = tenant.plaidUserToken ? await getMonthlyIncome(tenant.plaidUserToken) : null
    await savePlaidVerification(session.sub, {
      accessTokenEnc: encryptString(accessToken),
      itemId,
      verifiedMonthlyIncome: income,
    })
  } catch {
    return { error: 'Verification failed. Please try again.' }
  }

  // Unusually high link velocity → flag into the admin review queue + alert.
  if (linkCount >= PLAID_LINK_REVIEW_THRESHOLD) {
    await flagTenantForReview(session.sub, `High bank-link velocity (${linkCount} links)`)
    try {
      await sendSecurityAlert({
        subject: 'Tenant flagged: high bank-link velocity',
        body: `Tenant ${tenant.name} (${tenant.email}) has linked banks ${linkCount} times and was flagged for review.`,
      })
    } catch {
      /* alert is best-effort */
    }
  }

  revalidatePath('/tenants')
  return { ok: true }
}
