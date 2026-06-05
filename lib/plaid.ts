import 'server-only'

import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  IncomeVerificationSourceType,
} from 'plaid'

let client: PlaidApi | null = null

/** Lazy Plaid client so `next build` doesn't require credentials at import. */
export function getPlaid(): PlaidApi {
  if (client) return client
  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  const env = (process.env.PLAID_ENV ?? 'sandbox') as keyof typeof PlaidEnvironments
  if (!clientId || !secret) throw new Error('Missing PLAID_CLIENT_ID / PLAID_SECRET')
  client = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: { headers: { 'PLAID-CLIENT-ID': clientId, 'PLAID-SECRET': secret } },
    }),
  )
  return client
}

/** Income flows require a Plaid user token tied to our user id. */
export async function createUserToken(clientUserId: string): Promise<string> {
  const res = await getPlaid().userCreate({ client_user_id: clientUserId })
  return res.data.user_token
}

/** Link token for the Bank Income verification flow. */
export async function createIncomeLinkToken(userToken: string, clientUserId: string): Promise<string> {
  const res = await getPlaid().linkTokenCreate({
    user: { client_user_id: clientUserId },
    user_token: userToken,
    client_name: 'edynsgate',
    products: [Products.IncomeVerification],
    country_codes: [CountryCode.Us],
    language: 'en',
    income_verification: {
      income_source_types: [IncomeVerificationSourceType.Bank],
      bank_income: { days_requested: 90 },
    },
  })
  return res.data.link_token
}

export async function exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }> {
  const res = await getPlaid().itemPublicTokenExchange({ public_token: publicToken })
  return { accessToken: res.data.access_token, itemId: res.data.item_id }
}

/**
 * Derive an estimated monthly income (USD) from Plaid Bank Income.
 * Defensive: returns null if the product isn't enabled or the shape is unexpected.
 */
export async function getMonthlyIncome(userToken: string): Promise<number | null> {
  try {
    const res = await getPlaid().creditBankIncomeGet({ user_token: userToken })
    // The SDK's typings for this payload are loose across versions; parse defensively.
    const reports = (res.data as { bank_income?: unknown[] }).bank_income ?? []
    const report = reports[0] as
      | { bank_income_summary?: { total_amount?: number; start_date?: string; end_date?: string } }
      | undefined
    const summary = report?.bank_income_summary
    if (!summary || typeof summary.total_amount !== 'number') return null

    // total_amount covers the requested window (~90 days). Convert to a monthly figure.
    let months = 3
    if (summary.start_date && summary.end_date) {
      const days = (new Date(summary.end_date).getTime() - new Date(summary.start_date).getTime()) / 86_400_000
      if (days > 0) months = Math.max(1, days / 30)
    }
    return Math.round(summary.total_amount / months)
  } catch {
    return null
  }
}
