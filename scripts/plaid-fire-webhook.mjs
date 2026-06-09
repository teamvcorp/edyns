/**
 * Fire a sandbox Income webhook at your receiver to confirm it's wired up.
 *
 * Run:  node --env-file=.env scripts/plaid-fire-webhook.mjs <item_id> [verification_status]
 *
 * <item_id> comes from a completed sandbox income Link flow. Default status is
 * VERIFICATION_STATUS_PROCESSING_COMPLETE. Plaid will POST a signed webhook to
 * PLAID_WEBHOOK_URL — watch your deployed logs for the receiver's 200.
 */
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

const itemId = process.argv[2]
const verificationStatus = process.argv[3] ?? 'VERIFICATION_STATUS_PROCESSING_COMPLETE'
const webhook = process.env.PLAID_WEBHOOK_URL

if (!itemId) {
  console.error('Usage: node --env-file=.env scripts/plaid-fire-webhook.mjs <item_id> [verification_status]')
  process.exit(1)
}
if (!webhook) {
  console.error('PLAID_WEBHOOK_URL is not set in .env')
  process.exit(1)
}

const client = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SANDBOX_SECRET ?? process.env.PLAID_SECRET,
      },
    },
  }),
)

try {
  const r = await client.sandboxIncomeFireWebhook({
    item_id: itemId,
    webhook,
    verification_status: verificationStatus,
  })
  console.log(`✅ Fired ${verificationStatus} → ${webhook} (HTTP ${r.status})`)
  console.log('   Now check your deployed logs for the webhook receiver responding 200.')
} catch (e) {
  const d = e?.response?.data
  console.log(`❌ ${d?.error_code ?? e.message} :: ${d?.error_message ?? ''}`)
}
