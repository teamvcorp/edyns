'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/dal'
import { getTenantByUserId, savePlaidVerification } from '@/lib/tenants'
import { exchangePublicToken, getMonthlyIncome } from '@/lib/plaid'
import { encryptString } from '@/lib/crypto'

export type PlaidResult = { ok?: boolean; error?: string }

/** Finalize a Plaid Link: store the (encrypted) access token and verified income. */
export async function completePlaidLink(publicToken: string): Promise<PlaidResult> {
  const session = await requireRole('tenant', '/tenants/login')
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant) return { error: 'No application found.' }

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

  revalidatePath('/tenants')
  return { ok: true }
}
