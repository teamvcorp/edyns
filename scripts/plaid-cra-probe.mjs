/**
 * Probe: does the account support the user_id-based CRA / Consumer Report flow?
 * Run: node --env-file=.env scripts/plaid-cra-probe.mjs [sandbox|production]
 */
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  ConsumerReportPermissiblePurpose,
} from 'plaid'

const env = process.argv[2] ?? 'sandbox'
const secret = env === 'production' ? process.env.PLAID_PRODUCTION_SECRET : process.env.PLAID_SANDBOX_SECRET
const client = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID, 'PLAID-SECRET': secret } },
  }),
)

const cid = `cra-probe-${Date.now()}`
const log = (l, v = '') => console.log(`[${env}] ${l}${v ? ' — ' + v : ''}`)
const err = (l, e) => {
  const d = e?.response?.data
  console.log(`[${env}] ❌ ${l} — ${d?.error_code ?? e.message} :: ${d?.error_message ?? ''}`)
}

try {
  const u = await client.userCreate({ client_user_id: cid })
  log('user_id', u.data.user_id)
} catch (e) {
  err('user/create', e)
}

// CRA (Plaid Check / Consumer Report) link token — user_id based, no user_token.
try {
  const lt = await client.linkTokenCreate({
    user: { client_user_id: cid },
    client_name: 'edynsgate',
    products: [Products.CraBaseReport, Products.CraIncomeInsights],
    country_codes: [CountryCode.Us],
    language: 'en',
    consumer_report_permissible_purpose: ConsumerReportPermissiblePurpose.Employment,
    cra_options: { days_requested: 90 },
  })
  console.log(`[${env}] ✅ CRA link token OK — ${lt.data.link_token.slice(0, 18)}…`)
} catch (e) {
  err('CRA link token', e)
}
