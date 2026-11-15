import type { Metadata } from 'next'
import { requireRole } from '@/lib/dal'
import { getTenantByUserId } from '@/lib/tenants'
import { listRequestsByTenant } from '@/lib/moveins'
import { getPropertyById } from '@/lib/properties'
import { resumeApplicationPayment, payShortfallAction } from '@/app/actions/tenants'
import { REQUIRED_WEEKLY_HOURS } from '@/lib/stripe'
import { PROGRAMS, programOf, rateSummary, carEligibleOn, carTrustComplete, CAR_TRUST_MONTHS } from '@/lib/programs'
import { balancesFor } from '@/lib/program-ledger'
import { rentFunds } from '@/lib/shortfall'
import { affordablePropertiesFor } from '@/lib/affordable-homes'
import { getActiveCar } from '@/lib/car-assignments'
import { PublicPropertyCard } from '@/components/properties/public-property-card'
import { tierLabel } from '@/lib/tiers'
import { formatAddress, formatCurrency, formatCents } from '@/lib/format'
import { PlaidVerifyButton } from '@/components/tenants/plaid-verify-button'
import { SelfEmployedToggle } from '@/components/tenants/self-employed-toggle'
import { IdentityVerifyButton } from '@/components/tenants/identity-verify-button'
import { MoveInButton } from '@/components/properties/move-in-button'
import { hasActiveRequest } from '@/lib/moveins'
import { PortalShell } from '@/components/site/portal-shell'
import { Card } from '@/components/elements/card'
import { Text } from '@/components/elements/text'
import { Button, ButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'

export const metadata: Metadata = { title: 'Tenant portal' }

const statusCopy = {
  pending: { label: 'Pending review', body: 'Your application is in the queue. We’ll email you once it’s reviewed.' },
  approved: { label: 'Approved', body: 'You’re approved! Verify your income below so we can set up your collection.' },
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
  searchParams: Promise<{ identity?: string; shortfall?: string }>
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
  const program = programOf(tenant)
  const def = PROGRAMS[program]
  // Program ledger: rent held for their landlord + car-program payments (non-Effort-Exchange programs).
  const funds = !def.managedHousing && tenant.status === 'approved' ? await balancesFor(tenant.id) : null
  const activeCar = def.carRate > 0 && tenant.status === 'approved' ? await getActiveCar(tenant.id) : null
  const carEligibleDate = funds ? carEligibleOn(funds.firstCarPaymentAt) : null
  const carTrusted = funds ? carTrustComplete(funds.firstCarPaymentAt) : false
  // Available rent funds (outside-landlord): reserve beyond this month + upgrade readiness.
  const rentReserve = funds && def.outsideLandlord ? await rentFunds(tenant) : null
  // Homes within budget (rent ≤ 30% of income) for approved tenants not yet in one of our homes.
  const budgetIncome = tenant.employment.verifiedMonthlyIncome ?? tenant.employment.monthlyIncome
  const affordable =
    tenant.status === 'approved' && !tenant.currentPropertyId ? await affordablePropertiesFor(budgetIncome) : null
  const householdSize = 1 + tenant.adults.length + tenant.children.length

  const verifiedIncome = tenant.employment.verifiedMonthlyIncome
  const verifiedHours = tenant.employment.verifiedWeeklyHours
  const billing = tenant.billing
  // A bank/payroll connection exists but income isn't confirmed yet — Plaid's
  // payroll/bank-income reads are often asynchronous and finish via the webhook.
  const plaidPending = Boolean(tenant.plaidItemId) && !tenant.employment.verified
  const incomeStatus = tenant.employment.verified
    ? 'Verified'
    : plaidPending
      ? 'Confirming'
      : tenant.status === 'approved'
          ? 'Action needed'
          : 'After approval'

  // Move-in requests, joined with property address for display.
  const requests = await listRequestsByTenant(tenant.id)
  const requestRows = await Promise.all(
    requests.map(async (r) => ({ request: r, property: await getPropertyById(r.propertyId) })),
  )

  // Property they found us through (invite hint). Only surfaced while it's still
  // approved; offered as a one-click request once the tenant is approved.
  const hinted = tenant.interestedPropertyId ? await getPropertyById(tenant.interestedPropertyId) : null
  const hintedProperty = hinted?.status === 'approved' ? hinted : null
  const alreadyRequestedHinted = hintedProperty ? await hasActiveRequest(tenant.id, hintedProperty.id) : false

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

      {/* Program + money records (lib/programs.ts, lib/program-ledger.ts) */}
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Your program</h3>
          <span className="text-sm font-semibold text-olive-700 dark:text-olive-300">{def.label}</span>
        </div>
        <Text className="text-sm/6">
          <p>
            {def.summary} We collect {rateSummary(program)} of your pay. Every program asks for {REQUIRED_WEEKLY_HOURS}{' '}
            hours of work a week.
          </p>
        </Text>
        {tenant.landlord && (
          <Text className="text-sm/6">
            <p>
              Your landlord: <strong>{tenant.landlord.name}</strong> · rent {formatCents(tenant.landlord.monthlyRentCents)}
              /month. We pay your landlord from the rent we collect. If it doesn’t cover the full rent in a month, we’ll
              email you the difference and offer to collect it.
            </p>
          </Text>
        )}
        {rentReserve && (
          <Text className="text-xs/5">
            <p>
              Rent we collect beyond what your landlord is owed stays in your available rent funds. It isn’t
              refundable, but it covers your rent if you change jobs or come up short, and as it grows you can be
              offered a nicer home.
            </p>
          </Text>
        )}
        {rentReserve?.upgradeReady && (
          <p role="status" className="rounded-xl bg-olive-950/5 px-4 py-3 text-sm text-olive-950 dark:bg-white/5 dark:text-white">
            Your rent funds have built up — you may qualify for a nicer home (bigger, better appliances, a nicer area).
            Our team will reach out with options.
          </p>
        )}
        {funds && (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {def.carRate > 0 && (
              <div>
                <dt className="text-sm text-olive-600 dark:text-olive-500">Car payments made</dt>
                <dd className="font-display text-3xl text-olive-950 dark:text-white">{funds.carPaymentCount}</dd>
              </div>
            )}
            {def.outsideLandlord && (
              <>
                <div>
                  <dt className="text-sm text-olive-600 dark:text-olive-500">Available rent funds</dt>
                  <dd className="font-display text-3xl text-olive-950 dark:text-white">{formatCents(funds.rentHeldCents)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-olive-600 dark:text-olive-500">Paid to your landlord</dt>
                  <dd className="font-display text-3xl text-olive-950 dark:text-white">{formatCents(funds.landlordPaidCents)}</dd>
                </div>
              </>
            )}
          </dl>
        )}
      </Card>

      {/* Car program: trust period, then an edynsgate-owned car + insurance (lib/car-assignments.ts) */}
      {def.carRate > 0 && tenant.status === 'approved' && (
        <Card id="car" className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Your car</h3>
          {activeCar ? (
            <Text className="text-sm/6">
              <p>
                <strong>{activeCar.vehicle}</strong>
                {activeCar.plate ? ` · plate ${activeCar.plate}` : ''}. edynsgate owns this car and pays its
                insurance{activeCar.insurance ? ` (${activeCar.insurance})` : ''}. Keep up your car program payments to
                keep using it — if payments stop or you leave the program, the car is returned.
              </p>
              {activeCar.notes && <p>{activeCar.notes}</p>}
            </Text>
          ) : (
            <Text className="text-sm/6">
              <p>
                After {CAR_TRUST_MONTHS} months of car program payments, we provide a car and pay its insurance.{' '}
                {carEligibleDate
                  ? carTrusted
                    ? 'You’ve completed the trust period — our team will contact you about your car.'
                    : `You’re on track: your trust period ends ${carEligibleDate.toLocaleDateString()}.`
                  : 'Your trust period starts with your first car program payment.'}
              </p>
            </Text>
          )}
        </Card>
      )}

      {/* Own-landlord monthly rent shortfall (set by app/api/cron/rent-shortfall) */}
      {tenant.shortfall && (!tenant.shortfall.paidAt || sp.shortfall === 'paid') && (
        <Card id="shortfall" className="flex flex-col gap-3 ring-amber-500/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Rent balance due</h3>
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {tenant.shortfall.paidAt ? 'Paid' : formatCents(tenant.shortfall.amountCents)}
            </span>
          </div>
          {sp.shortfall === 'paid' || tenant.shortfall.paidAt ? (
            <Text className="text-sm/6">
              <p>Thank you — we’ve received your payment and will include it in your rent to your landlord.</p>
            </Text>
          ) : sp.shortfall === 'covered' ? (
            <Text className="text-sm/6">
              <p>Good news — what we’ve collected now covers this month’s rent. Nothing more is due.</p>
            </Text>
          ) : (
            <>
              <Text className="text-sm/6">
                <p>
                  What we collected for {tenant.shortfall.month} won’t cover your full rent. You can pay the difference
                  once here (plus Stripe processing) and we’ll include it in your landlord payment, or pay your landlord
                  directly.
                </p>
              </Text>
              {sp.shortfall === 'error' && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  We couldn’t start the payment. Please try again, or reply to our email for help.
                </p>
              )}
              <form action={payShortfallAction}>
                <Button type="submit">Pay {formatCents(tenant.shortfall.amountCents)}</Button>
              </form>
            </>
          )}
        </Card>
      )}

      {/* Property they found us through (reassurance only) */}
      {hintedProperty && (
        <Card className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">The home you’re interested in</h3>
          <Text className="text-sm/6">
            <p>
              {formatAddress(hintedProperty.address)} · Tier {hintedProperty.tier ?? 0} · {tierLabel(hintedProperty.tier)}.{' '}
              <Link href={`/properties/${hintedProperty.id}`}>View home</Link>
            </p>
          </Text>
          {tenant.status === 'approved' ? (
            alreadyRequestedHinted ? (
              <p className="text-sm text-olive-700 dark:text-olive-300">You’ve requested this home — see below.</p>
            ) : (
              <MoveInButton propertyId={hintedProperty.id} />
            )
          ) : tenant.status === 'pending' ? (
            <Text className="text-sm/6">
              <p>We’ve noted your interest. Once your application is approved you can request to move in here.</p>
            </Text>
          ) : null}
        </Card>
      )}

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
          <>
            <Text className="text-sm/6">
              <p>
                {tenant.employment.verificationMethod === 'manual'
                  ? 'Your income was verified by our team.'
                  : 'Bank connected via Plaid.'}{' '}
                {verifiedIncome ? `Verified income ${formatCurrency(verifiedIncome)}/mo.` : 'Income estimate pending.'}
                {verifiedHours != null ? ` Confirmed ${verifiedHours} hrs/week.` : ''}
              </p>
            </Text>
            {verifiedHours == null && (
              <>
                <Text className="text-sm/6">
                  <p>
                    We couldn’t confirm your weekly hours automatically. Our team will reach out to confirm you’re
                    working {REQUIRED_WEEKLY_HOURS}+ hours a week — no action is needed from you right now.
                  </p>
                </Text>
              </>
            )}
          </>
        ) : (
          <>
            {plaidPending ? (
              <Text className="text-sm/6">
                <p>
                  We connected your account and are <strong>confirming your income</strong> — this can take a few
                  minutes, and we’ll email you when it’s done. If it doesn’t go through, you can try again with
                  the bank-deposits option below.
                </p>
              </Text>
            ) : (
              <Text className="text-sm/6">
                <p>
                  One last step before rent setup: <strong>connect your bank</strong> so we can confirm your income
                  deposits — this is required. You cover any Plaid/Stripe fees.
                </p>
              </Text>
            )}
            <SelfEmployedToggle
              selfEmployed={Boolean(tenant.employment.selfEmployed)}
              hourlyRate={tenant.employment.claimedHourlyRate}
            />
            <PlaidVerifyButton selfEmployed={Boolean(tenant.employment.selfEmployed)} />
            {/* Plaid is the only self-service income path; document uploads are admin-only. */}
            <p className="mt-2 border-t border-olive-950/10 pt-3 text-xs text-olive-600 dark:border-white/10 dark:text-olive-500">
              Trouble connecting your bank? Reply to your approval email and our team will help you finish verification.
            </p>
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
            {tenant.identityManual ? (
              <p>Your government ID was verified by our team.</p>
            ) : (
              <p>
                Your government ID is verified{tenant.idNumberLast4 ? ` (•••• ${tenant.idNumberLast4})` : ''}. Your full
                ID is stored securely by Stripe — never by edynsgate.
              </p>
            )}
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
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">
            {def.rentRate > 0 ? 'Rent collection' : 'Car program payments'}
          </h3>
          {billing && (
            <span className="text-sm font-semibold text-olive-700 capitalize dark:text-olive-300">{billing.status}</span>
          )}
        </div>
        {billing ? (
          <Text className="text-sm/6">
            <p>
              Drafting <strong>{formatCents(billing.amountCents)} {frequencyLabel[billing.frequency]}</strong> from
              your payment method. Next draft:{' '}
              <strong>{new Date(billing.nextDraftAt ?? billing.firstDraftAt).toLocaleDateString()}</strong>. This is{' '}
              {rateSummary(program)} of your income plus Stripe processing, which you cover. Any credit on your account
              (for example, a cash payment) is applied to your next draft automatically.
            </p>
            {billing.split && (
              <p className="mt-2">
                Each draft: {formatCents(billing.split.rentCents)} toward rent
                {billing.split.carCents > 0 ? ` and ${formatCents(billing.split.carCents)} for the car program` : ''}.
              </p>
            )}
            {(tenant.rentCredits?.length ?? 0) > 0 && (
              <>
                <p className="mt-2 font-medium">Payments credited to your rent</p>
                <ul>
                  {[...(tenant.rentCredits ?? [])].reverse().map((c) => (
                    <li key={c.stripeTransactionId}>
                      {new Date(c.receivedAt).toLocaleDateString()} — {formatCents(c.amountCents)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Text>
        ) : tenant.status === 'approved' ? (
          <Text className="text-sm/6">
            <p>
              Once your income is verified, our team sets up your collection — the amount ({rateSummary(program)} of
              your pay), how often it drafts, and the first draft date.
            </p>
          </Text>
        ) : (
          <Text className="text-sm/6">
            <p>Collection begins after your application is approved and your income is verified.</p>
          </Text>
        )}
      </Card>

      {/* Repairs — only once they live in one of our homes (lib/repairs.ts eligibility). */}
      {tenant.currentPropertyId && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
              <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Repairs</h3>
              <Text className="text-sm/6">
                <p>Something broken at home? Send a repair request and track its progress.</p>
              </Text>
            </div>
            <ButtonLink href="/tenants/repairs">Request a repair</ButtonLink>
          </div>
        </Card>
      )}

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

      {/* Homes within budget — the goal is housing they can afford (lib/affordable-homes.ts) */}
      {affordable && (
        <Card id="affordable" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Homes within your budget</h3>
            <Text className="text-sm/6">
              <p>
                Homes in our network with rent of {formatCurrency(affordable.maxRent)}/month or less — 30% of your{' '}
                {tenant.employment.verifiedMonthlyIncome != null ? 'verified' : 'reported'} income.
                {tenant.landlord && tenant.landlord.monthlyRentCents / 100 > affordable.maxRent
                  ? ' Your current rent is above that, so one of these could save you money every month.'
                  : ''}
              </p>
            </Text>
          </div>
          {affordable.homes.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {affordable.homes.map((p) => (
                <PublicPropertyCard key={p.id} property={p} />
              ))}
            </div>
          ) : (
            <Text className="text-sm/6">
              <p>No homes in that range are open right now. We add homes often — check back soon.</p>
            </Text>
          )}
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

      <Link href="/programs/tenants">How our programs work →</Link>
    </PortalShell>
  )
}
