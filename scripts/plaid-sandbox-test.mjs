/**
 * Sandbox connectivity + entitlement test for the Plaid Income endpoints.
 *
 * Run:  node --env-file=.env scripts/plaid-sandbox-test.mjs
 *
 * It forces the SANDBOX environment + PLAID_SANDBOX_SECRET, creates a fresh
 * user_token, creates income link tokens, then calls the three income "get"
 * endpoints. A fresh user has no completed flow, so the expected healthy result
 * is an empty payload or a "not ready / no data" error — NOT an auth or
 * entitlement error. Auth/entitlement failures are what this surfaces.
 */
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  IncomeVerificationSourceType,
} from 'plaid'

const clientId = process.env.PLAID_CLIENT_ID
const secret = process.env.PLAID_SANDBOX_SECRET ?? process.env.PLAID_SECRET
if (!clientId || !secret) {
  console.error('Missing PLAID_CLIENT_ID or PLAID_SANDBOX_SECRET in .env')
  process.exit(1)
}

const client = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments.sandbox,
    baseOptions: { headers: { 'PLAID-CLIENT-ID': clientId, 'PLAID-SECRET': secret } },
  }),
)

const ok = (label, extra = '') => console.log(`✅ ${label}${extra ? ' — ' + extra : ''}`)
const fail = (label, e) => {
  const d = e?.response?.data
  console.log(`❌ ${label} — ${d?.error_code ?? e.message} :: ${d?.error_message ?? ''}`)
}

async function tryGet(label, fn) {
  try {
    const r = await fn()
    ok(label, `reachable (HTTP ${r.status})`)
  } catch (e) {
    const d = e?.response?.data
    // A fresh user with no data legitimately returns these — endpoint works.
    const benign = ['PRODUCT_NOT_READY', 'NO_ACCOUNTS', 'PRODUCTS_NOT_READY']
    if (d && benign.includes(d.error_code)) ok(label, `reachable (no data yet: ${d.error_code})`)
    else fail(label, e)
  }
}

const cid = `ee-sandbox-test-${Date.now()}`

console.log('\nPlaid sandbox test — client', clientId, '\n')

let userToken
try {
  const u = await client.userCreate({ client_user_id: cid })
  userToken = u.data.user_token
  ok('/user/create', userToken ? 'user_token issued' : 'no user_token (CRA/Income may be off)')
  console.log('   raw /user/create response:', JSON.stringify(u.data))
} catch (e) {
  fail('/user/create', e)
  process.exit(1)
}

// Link token — Bank Income
try {
  const lt = await client.linkTokenCreate({
    user: { client_user_id: cid },
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
  ok('link/token/create (Bank Income)', lt.data.link_token.slice(0, 16) + '…')
} catch (e) {
  fail('link/token/create (Bank Income)', e)
}

// Link token — Payroll + Document Income
try {
  const lt = await client.linkTokenCreate({
    user: { client_user_id: cid },
    user_token: userToken,
    client_name: 'edynsgate',
    products: [Products.IncomeVerification],
    country_codes: [CountryCode.Us],
    language: 'en',
    income_verification: {
      income_source_types: [IncomeVerificationSourceType.Payroll],
    },
  })
  ok('link/token/create (Payroll/Document)', lt.data.link_token.slice(0, 16) + '…')
} catch (e) {
  fail('link/token/create (Payroll/Document)', e)
}

console.log('\nIncome retrieval endpoints:')
await tryGet('/credit/bank_income/get', () => client.creditBankIncomeGet({ user_token: userToken }))
await tryGet('/credit/payroll_income/get', () => client.creditPayrollIncomeGet({ user_token: userToken }))
await tryGet('/credit/bank_statements/uploads/get', () =>
  client.creditBankStatementsUploadsGet({ user_token: userToken }),
)

console.log('\nDone.\n')
