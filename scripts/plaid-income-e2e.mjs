/**
 * End-to-end probe (up to the point a human must click through a bank login):
 *   1. /user/create  -> user_token + user_id
 *   2. /link_token/create with Income Verification (Payroll + Bank), using the
 *      same redirect_uri / webhook the app uses in createIncomeLinkToken().
 * A clean link_token proves the user_token Income flow is fully unblocked.
 *
 * Run: node --env-file=.env scripts/plaid-income-e2e.mjs [sandbox|production] [payroll|bank|both]
 */
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  IncomeVerificationSourceType,
} from 'plaid'

const env = process.argv[2] ?? 'production'
// Source mode: payroll (employees), bank (self-employed), or both (the old combo).
const mode = process.argv[3] ?? 'both'
const sources =
  mode === 'payroll'
    ? [IncomeVerificationSourceType.Payroll]
    : mode === 'bank'
      ? [IncomeVerificationSourceType.Bank]
      : [IncomeVerificationSourceType.Payroll, IncomeVerificationSourceType.Bank]
const wantsBank = sources.includes(IncomeVerificationSourceType.Bank)
const secret = env === 'production' ? process.env.PLAID_PRODUCTION_SECRET : process.env.PLAID_SANDBOX_SECRET
if (!process.env.PLAID_CLIENT_ID || !secret) {
  console.error(`Missing PLAID_CLIENT_ID or the ${env} secret`)
  process.exit(1)
}

const client = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID, 'PLAID-SECRET': secret } },
  }),
)

const err = (l, e) => {
  const d = e?.response?.data
  console.log(`[${env}] ❌ ${l} — ${d?.error_code ?? e.message} :: ${d?.error_message ?? ''}`)
  process.exit(1)
}

const cid = `income-e2e-${Date.now()}`

let userToken
try {
  const u = await client.userCreate({ client_user_id: cid })
  userToken = u.data.user_token
  console.log(`[${env}] ✅ user/create — user_id=${u.data.user_id}`)
  console.log(`[${env}] ${userToken ? 'user_token PRESENT ✅' : 'user_token MISSING ❌'}`)
  if (!userToken) process.exit(1)
} catch (e) {
  err('user/create', e)
}

const redirectUri = process.env.PLAID_REDIRECT_URI
const webhook = process.env.PLAID_WEBHOOK_URL
try {
  const lt = await client.linkTokenCreate({
    user: { client_user_id: cid },
    user_token: userToken,
    client_name: 'edynsgate',
    products: [Products.IncomeVerification],
    country_codes: [CountryCode.Us],
    language: 'en',
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    ...(webhook?.startsWith('https://') ? { webhook } : {}),
    income_verification: {
      income_source_types: sources,
      ...(wantsBank ? { bank_income: { days_requested: 90 } } : {}),
    },
  })
  console.log(`[${env}] ✅ income link_token OK — ${lt.data.link_token.slice(0, 18)}…`)
  console.log(`[${env}]    redirect_uri=${redirectUri ?? '(none)'}  webhook=${webhook?.startsWith('https://') ? 'sent' : '(none)'}  sources=${mode}`)
  console.log(`[${env}] 🎉 Income flow unblocked — only the human bank-login step in Plaid Link remains.`)
} catch (e) {
  err('income link_token', e)
}
