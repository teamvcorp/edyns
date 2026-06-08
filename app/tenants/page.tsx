import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { getTenantByUserId } from '@/lib/tenants'
import { listRequestsByTenant } from '@/lib/moveins'
import { getPropertyById } from '@/lib/properties'
import { resumeApplicationPayment } from '@/app/actions/tenants'
import { COLLECTION_RATE } from '@/lib/stripe'
import { tierLabel } from '@/lib/tiers'
import { formatAddress, formatCurrency } from '@/lib/format'
import { PlaidVerifyButton } from '@/components/tenants/plaid-verify-button'
import { PaystubUploader } from '@/components/tenants/paystub-uploader'
import { IdentityVerifyButton } from '@/components/tenants/identity-verify-button'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { Button, ButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'

export const metadata: Metadata = { title: 'Tenant portal' }

const statusCopy = {
  pending: { label: 'Pending review', body: 'Your application is in the queue. We’ll email you once it’s reviewed.' },
  approved: { label: 'Approved', body: 'You’re approved! You can browse available properties below.' },
  rejected: { label: 'Not approved', body: 'Your application was not approved.' },
} as const

const feeCopy = {
  unpaid: 'Not paid',
  processing: 'Processing',
  paid: 'Paid',
} as const

const frequencyLabel = { weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly' } as const

export default async function TenantPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ identity?: string }>
}) {
  const session = await requireRole('tenant', '/tenants/login')
  const sp = await searchParams
  const tenant = await getTenantByUserId(session.sub)

  // Signed in but no application on file (shouldn't normally happen) — send to enroll.
  if (!tenant) {
    return (
      <PortalShell eyebrow="Tenant portal" title={`Welcome, ${session.name ?? 'tenant'}`}>
        <Card className="flex flex-col items-start gap-3">
          <Text className="text-sm/6">
            <p>You don’t have an application yet.</p>
          </Text>
          <ButtonLink href="/tenants/enroll">Start your application</ButtonLink>
        </Card>
      </PortalShell>
    )
  }

  const status = statusCopy[tenant.status]
  const householdSize = 1 + tenant.adults.length + tenant.children.length

  const verifiedIncome = tenant.employment.verifiedMonthlyIncome
  const billing = tenant.billing
  const incomeStatus = tenant.employment.verified
    ? 'Verified'
    : tenant.paystub
      ? 'Paystub uploaded'
      : tenant.status === 'approved'
        ? 'Action needed'
        : 'After approval'

  // Move-in requests, joined with property address for display.
  const requests = await listRequestsByTenant(tenant.id)
  const requestRows = await Promise.all(
    requests.map(async (r) => ({ request: r, property: await getPropertyById(r.propertyId) })),
  )

  return (
    <PortalShell eyebrow="Tenant portal" title={`Welcome, ${session.name ?? 'tenant'}`}>
      {/* Application status */}
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Application status</h3>
          <span className="text-sm font-semibold text-olive-700 dark:text-olive-300">{status.label}</span>
        </div>
        <Text className="text-sm/6">
          <p>{status.body}</p>
        </Text>
        {tenant.status === 'rejected' && tenant.rejectionReason && (
          <p className="text-sm text-red-600 dark:text-red-400">Reason: {tenant.rejectionReason}</p>
        )}
      </Card>

      {/* Application fee */}
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Application fee</h3>
          <span className="text-sm font-semibold text-olive-700 dark:text-olive-300">
            {feeCopy[tenant.fee.status]} · {formatCurrency(tenant.fee.amountCents / 100)}
          </span>
        </div>
        {tenant.fee.status === 'unpaid' && (
          <form action={resumeApplicationPayment}>
            <Text className="mb-3 text-sm/6">
              <p>Your application fee hasn’t been paid yet. Pay now to keep your application moving.</p>
            </Text>
            <Button type="submit">Pay application fee</Button>
          </form>
        )}
        {tenant.fee.status === 'processing' && (
          <Text className="text-sm/6">
            <p>Your bank payment is processing. We’ll confirm it shortly — no action needed.</p>
          </Text>
        )}
      </Card>

      {/* Household summary */}
      <Card className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Household</h3>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-olive-600 dark:text-olive-500">Members</dt>
            <dd className="font-display text-3xl text-olive-950 dark:text-white">{householdSize}</dd>
          </div>
          <div>
            <dt className="text-sm text-olive-600 dark:text-olive-500">Adults 18+</dt>
            <dd className="font-display text-3xl text-olive-950 dark:text-white">{1 + tenant.adults.length}</dd>
          </div>
          <div>
            <dt className="text-sm text-olive-600 dark:text-olive-500">Children</dt>
            <dd className="font-display text-3xl text-olive-950 dark:text-white">{tenant.children.length}</dd>
          </div>
          <div>
            <dt className="text-sm text-olive-600 dark:text-olive-500">Income</dt>
            <dd className="text-sm text-olive-950 dark:text-white">{incomeStatus}</dd>
          </div>
        </dl>
      </Card>

      {/* Employment & income verification — unlocks after approval */}
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Employment & income</h3>
          <span className="text-sm font-semibold text-olive-700 dark:text-olive-300">{incomeStatus}</span>
        </div>
        {tenant.status !== 'approved' ? (
          <Text className="text-sm/6">
            <p>Income verification unlocks once your application is approved. We’ll email you when it’s time.</p>
          </Text>
        ) : tenant.employment.verified ? (
          <Text className="text-sm/6">
            <p>
              Bank connected via Plaid.{' '}
              {verifiedIncome ? `Verified income ${formatCurrency(verifiedIncome)}/mo.` : 'Income estimate pending.'}
            </p>
          </Text>
        ) : (
          <>
            <Text className="text-sm/6">
              <p>
                One last step: verify your income so we can set up your rent. Connect your bank with Plaid (fastest), or
                upload your most recent paystub. You cover any Plaid/Stripe fees.
              </p>
            </Text>
            <div className="flex flex-col gap-3">
              <PlaidVerifyButton />
              <span className="text-xs text-olive-600 dark:text-olive-500">
                or upload your most recent paystub (PDF or image)
              </span>
              <PaystubUploader currentUrl={tenant.paystub?.url} />
            </div>
            {tenant.paystub && (
              <p className="text-sm text-olive-700 dark:text-olive-300">
                Paystub received — our team will review it and set up your rent collection.
              </p>
            )}
          </>
        )}
      </Card>

      {/* Identity verification (government ID + selfie) */}
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Identity verification</h3>
          <span className="text-sm font-semibold text-olive-700 dark:text-olive-300">
            {tenant.identityVerified ? 'Verified' : 'Not verified'}
          </span>
        </div>
        {tenant.identityVerified ? (
          <Text className="text-sm/6">
            <p>
              Your government ID is verified{tenant.idNumberLast4 ? ` (•••• ${tenant.idNumberLast4})` : ''}. Your full ID
              is stored securely by Stripe — never by edynsgate.
            </p>
          </Text>
        ) : (
          <>
            <Text className="text-sm/6">
              <p>Verify your government ID and a selfie to complete your application. Handled securely by Stripe.</p>
            </Text>
            <IdentityVerifyButton returning={sp.identity === 'done'} />
          </>
        )}
      </Card>

      {/* Rent collection (set up by our team after income is verified) */}
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Rent collection</h3>
          {billing && (
            <span className="text-sm font-semibold text-olive-700 capitalize dark:text-olive-300">{billing.status}</span>
          )}
        </div>
        {billing ? (
          <Text className="text-sm/6">
            <p>
              Drafting <strong>{formatCurrency(billing.amountCents / 100)} {frequencyLabel[billing.frequency]}</strong>{' '}
              from your payment method, starting {new Date(billing.firstDraftAt).toLocaleDateString()}. This is{' '}
              {Math.round(COLLECTION_RATE * 100)}% of your income plus Stripe processing, which you cover.
            </p>
          </Text>
        ) : tenant.status === 'approved' ? (
          <Text className="text-sm/6">
            <p>
              Once your income is verified, our team sets up your rent collection — the amount ({Math.round(COLLECTION_RATE * 100)}% of
              your pay), how often it drafts, and the first draft date.
            </p>
          </Text>
        ) : (
          <Text className="text-sm/6">
            <p>Rent collection begins after your application is approved and your income is verified.</p>
          </Text>
        )}
      </Card>

      {/* Move-in requests */}
      {requestRows.length > 0 && (
        <Card className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Your move-in requests</h3>
          <div className="flex flex-col divide-y divide-olive-950/10 dark:divide-white/10">
            {requestRows.map(({ request, property }) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="flex flex-col">
                  <span className="text-sm text-olive-950 dark:text-white">
                    {property ? formatAddress(property.address) : 'Property'}
                  </span>
                  {property && (
                    <span className="text-xs text-olive-600 dark:text-olive-500">
                      Tier {property.tier ?? 0} · {tierLabel(property.tier)}
                    </span>
                  )}
                </div>
                <span className="text-sm font-semibold text-olive-700 capitalize dark:text-olive-300">
                  {request.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Browse — gated behind approval */}
      <Card className="flex flex-col items-start gap-3">
        <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Available properties</h3>
        {tenant.status === 'approved' ? (
          <>
            <Text className="text-sm/6">
              <p>Browse homes across every tier and request to move into any you qualify for.</p>
            </Text>
            <ButtonLink href="/properties">Browse properties</ButtonLink>
          </>
        ) : (
          <Text className="text-sm/6">
            <p>
              You can <Link href="/properties">browse available properties</Link> now. Once your application is approved,
              you’ll be able to request to move in.
            </p>
          </Text>
        )}
      </Card>

      <Link href="/programs/tenants">How the Effort Exchange works →</Link>
    </PortalShell>
  )
}
