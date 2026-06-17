import 'server-only'

import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  IncomeVerificationSourceType,
} from 'plaid'
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from 'jose'
import { createHash, timingSafeEqual } from 'node:crypto'

let client: PlaidApi | null = null

/** Lazy Plaid client so `next build` doesn't require credentials at import. */
export function getPlaid(): PlaidApi {
  if (client) return client
  const clientId = process.env.PLAID_CLIENT_ID
  const env = (process.env.PLAID_ENV ?? 'sandbox') as keyof typeof PlaidEnvironments
  // Pick the secret that matches the active environment (production vs sandbox),
  // falling back to a generic PLAID_SECRET for backward compatibility.
  const secret =
    env === 'production'
      ? process.env.PLAID_PRODUCTION_SECRET ?? process.env.PLAID_SECRET
      : process.env.PLAID_SANDBOX_SECRET ?? process.env.PLAID_SECRET
  if (!clientId || !secret) {
    throw new Error(`Missing PLAID_CLIENT_ID or the secret for PLAID_ENV=${env}`)
  }
  client = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: { headers: { 'PLAID-CLIENT-ID': clientId, 'PLAID-SECRET': secret } },
    }),
  )
  return client
}

/** Income flows require a Plaid user token tied to our user id. Returns the
 *  user_token plus Plaid's user_id (the latter keys user-based income webhooks). */
export async function createUserToken(clientUserId: string): Promise<{ userToken: string; userId: string }> {
  const res = await getPlaid().userCreate({ client_user_id: clientUserId })
  return { userToken: res.data.user_token, userId: res.data.user_id }
}

/** Link token for income verification. Plaid allows exactly ONE income source
 *  type per Link token, so we request the single source the read path actually
 *  consumes: Bank deposits for the self-employed, Payroll (gross + hours) for
 *  employees. (See readIncome in lib/income.ts.) */
export async function createIncomeLinkToken(
  userToken: string,
  clientUserId: string,
  selfEmployed = false,
): Promise<string> {
  // Required for OAuth banks: must exactly match an Allowed redirect URI in the
  // Plaid Dashboard. Omitted locally (Plaid rejects http/localhost) so the
  // non-OAuth sandbox flow still works.
  const redirectUri = process.env.PLAID_REDIRECT_URI
  // Webhook for async income events; only sent when it's a reachable https URL.
  const webhook = process.env.PLAID_WEBHOOK_URL
  const res = await getPlaid().linkTokenCreate({
    user: { client_user_id: clientUserId },
    user_token: userToken,
    client_name: 'edynsgate',
    products: [Products.IncomeVerification],
    country_codes: [CountryCode.Us],
    language: 'en',
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    ...(webhook?.startsWith('https://') ? { webhook } : {}),
    income_verification: {
      // Exactly one source type (Plaid rejects more): Bank for self-employed,
      // Payroll for employees. bank_income only applies to the Bank source.
      income_source_types: selfEmployed
        ? [IncomeVerificationSourceType.Bank]
        : [IncomeVerificationSourceType.Payroll],
      ...(selfEmployed ? { bank_income: { days_requested: 90 } } : {}),
    },
  })
  return res.data.link_token
}

const toNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// Pay-frequency → periods per month / weeks per pay period (for normalizing payroll figures).
const PERIODS_PER_MONTH: Record<string, number> = {
  PAY_FREQUENCY_WEEKLY: 52 / 12,
  PAY_FREQUENCY_BIWEEKLY: 26 / 12,
  PAY_FREQUENCY_SEMIMONTHLY: 2,
  PAY_FREQUENCY_MONTHLY: 1,
}
const WEEKS_PER_PERIOD: Record<string, number> = {
  PAY_FREQUENCY_WEEKLY: 1,
  PAY_FREQUENCY_BIWEEKLY: 2,
  PAY_FREQUENCY_SEMIMONTHLY: 52 / 24,
  PAY_FREQUENCY_MONTHLY: 52 / 12,
}

interface PayStub {
  pay_period_details?: {
    pay_frequency?: string
    gross_earnings?: number
    pay_amount?: number
    pay_date?: string
    end_date?: string
  }
  earnings?: { total?: { current_amount?: number; hours?: number } }
}

/**
 * Derive estimated monthly income (USD), average weekly hours, and the most
 * recent pay date from Plaid Payroll Income. Defensive: returns nulls if the
 * product isn't enabled or the shape is unexpected. Figures use the latest stub.
 */
export async function getPayrollIncome(
  userToken: string,
): Promise<{ monthlyIncome: number | null; weeklyHours: number | null; lastPayDate: string | null }> {
  try {
    const res = await getPlaid().creditPayrollIncomeGet({ user_token: userToken })
    const items = (res.data as { items?: { payroll_income?: { pay_stubs?: PayStub[] }[] }[] }).items ?? []

    let stub: PayStub | undefined
    for (const it of items) {
      for (const pr of it.payroll_income ?? []) {
        const stubs = pr.pay_stubs ?? []
        if (stubs.length) {
          stub = stubs[stubs.length - 1]
          break
        }
      }
      if (stub) break
    }
    if (!stub) return { monthlyIncome: null, weeklyHours: null, lastPayDate: null }

    const freq = stub.pay_period_details?.pay_frequency
    const periodsPerMonth = freq ? PERIODS_PER_MONTH[freq] : undefined
    const weeksPerPeriod = freq ? WEEKS_PER_PERIOD[freq] : undefined

    // Use GROSS pay as the rent basis (gross_earnings; fall back to the gross
    // earnings total). We deliberately avoid net figures like pay_amount.
    const periodAmount =
      toNum(stub.pay_period_details?.gross_earnings) ?? toNum(stub.earnings?.total?.current_amount)
    const periodHours = toNum(stub.earnings?.total?.hours)

    const monthlyIncome = periodAmount !== null && periodsPerMonth ? Math.round(periodAmount * periodsPerMonth) : null
    const weeklyHours =
      periodHours !== null && weeksPerPeriod ? Math.round((periodHours / weeksPerPeriod) * 10) / 10 : null
    const lastPayDate = stub.pay_period_details?.pay_date ?? stub.pay_period_details?.end_date ?? null
    return { monthlyIncome, weeklyHours, lastPayDate }
  } catch {
    return { monthlyIncome: null, weeklyHours: null, lastPayDate: null }
  }
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

// Cache verification keys by key id (they rotate, so keep them keyed).
const webhookKeyCache = new Map<string, JWK>()

/**
 * Verify a Plaid webhook per Plaid's JWT scheme: the `Plaid-Verification` header
 * is an ES256 JWT whose `request_body_sha256` claim must match the SHA-256 of the
 * raw request body. The signing key is fetched from /webhook_verification_key/get.
 * Replay is bounded by checking the token age (5 min). Returns false on any doubt.
 */
export async function verifyPlaidWebhook(rawBody: string, verificationHeader: string | null): Promise<boolean> {
  if (!verificationHeader) return false

  let kid: string
  try {
    const header = decodeProtectedHeader(verificationHeader)
    if (header.alg !== 'ES256' || !header.kid) return false
    kid = header.kid
  } catch {
    return false
  }

  let jwk = webhookKeyCache.get(kid)
  if (!jwk) {
    try {
      const res = await getPlaid().webhookVerificationKeyGet({ key_id: kid })
      jwk = res.data.key as unknown as JWK
      webhookKeyCache.set(kid, jwk)
    } catch {
      return false
    }
  }

  try {
    const key = await importJWK(jwk, 'ES256')
    const { payload } = await jwtVerify(verificationHeader, key, { algorithms: ['ES256'], maxTokenAge: '5 min' })
    const expected = (payload as { request_body_sha256?: string }).request_body_sha256
    if (typeof expected !== 'string') return false
    const actual = createHash('sha256').update(rawBody, 'utf8').digest('hex')
    const a = Buffer.from(actual)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
