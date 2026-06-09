/**
 * Minimal probe: does /user/create return a user_token in the given environment?
 * /user/create is free and creates only a throwaway user object (no financial data).
 *
 * Run:  node --env-file=.env scripts/plaid-usertoken-check.mjs [sandbox|production]
 */
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

const env = process.argv[2] ?? 'production'
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

try {
  const u = await client.userCreate({ client_user_id: `tokencheck-${Date.now()}` })
  const t = u.data.user_token
  console.log(`[${env}] user_id=${u.data.user_id}`)
  console.log(`[${env}] user_token=${t ? t.slice(0, 18) + '… (PRESENT ✅)' : 'MISSING ❌'}`)
} catch (e) {
  const d = e?.response?.data
  console.log(`[${env}] ERR ${d?.error_code ?? e.message} :: ${d?.error_message ?? ''}`)
}
