import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import { getTenantById } from '@/lib/tenants'
import { getPropertyById } from '@/lib/properties'
import { Link } from '@/components/elements/link'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Breadcrumbs } from '@/components/elements/breadcrumbs'
import { TenantReviewActions } from '@/components/admin/tenant-review-actions'
import { TenantBillingForm } from '@/components/admin/tenant-billing-form'
import { EmploymentTypeForm } from '@/components/admin/employment-type-form'
import { IncomeVerifyForm } from '@/components/admin/income-verify-form'
import { PaycheckActionForm } from '@/components/admin/paycheck-forms'
import { ProgramChangeReview } from '@/components/admin/program-change-review'
import { decideDepositAction } from '@/app/actions/paychecks'
import { paycheckCollectionEnabled, listDeposits, monthlyDepositTotals } from '@/lib/paychecks'
import { listStatementsForTenant } from '@/lib/statements'
import { summarizeTenantStatements } from '@/lib/statement-reader'
import { RentAdjustForm } from '@/components/admin/rent-adjust-form'
import { RentCreditForm } from '@/components/admin/rent-credit-form'
import { StripeLinkForm } from '@/components/admin/stripe-link-form'
import { RentPauseForm } from '@/components/admin/rent-pause-form'
import { LandlordPaymentForm, LedgerAdjustmentForm } from '@/components/admin/program-funds-forms'
import { balancesFor, listLedger } from '@/lib/program-ledger'
import { rentFunds } from '@/lib/shortfall'
import { listCarAssignments } from '@/lib/car-assignments'
import { AssignCarForm, ReturnCarForm } from '@/components/admin/car-assignment-forms'
import { randomUUID } from 'node:crypto'
import {
  resumeTenantBillingAction,
  replaceImportedWithBillingAction,
  resendWelcomeEmailAction,
  resetTenantVerificationAction,
  markIdentityVerifiedManuallyAction,
  markFeeCollectedOfflineAction,
  uploadPaystubAction,
} from '@/app/actions/admin'
import { Button, SoftButton } from '@/components/elements/button'
import { formatAddress, formatCurrency, formatCents } from '@/lib/format'
import {
  PROGRAMS,
  programOf,
  rateSummary,
  pct,
  rentExceedsAffordable,
  carEligibleOn,
  carTrustComplete,
  CAR_TRUST_MONTHS,
  UPGRADE_RESERVE_MONTHS,
} from '@/lib/programs'
import {
  REQUIRED_WEEKLY_HOURS,
  getRentSubscriptionState,
  getBankAccountLast4,
  getCustomerCreditCents,
  paymentMethodLabel,
} from '@/lib/stripe'

export const metadata: Metadata = { title: 'Review application' }

const feeLabel = { unpaid: 'Unpaid', processing: 'Processing', paid: 'Paid' } as const
const statusLabel = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' } as const
const creditMethodLabel = {
  cash: 'Cash',
  check: 'Check',
  money_order: 'Money order',
  bank_transfer: 'Bank transfer',
  other: 'Other',
} as const
const ledgerKindLabel = {
  deposit: 'Payment',
  shortfall_payment: 'Shortfall payment',
  landlord_payment: 'Paid to landlord',
  adjustment: 'Adjustment',
} as const
const frequencyLabel = { weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly' } as const

// Date helpers live outside the component: reading the clock during render is
// impure (React lint), and these only seed form defaults.
/** yyyy-mm-dd for a date input, or '' if the date is missing or not in the future. */
function futureDateInput(d?: Date): string {
  if (!d) return ''
  const date = new Date(d)
  return date.getTime() > Date.now() ? date.toISOString().slice(0, 10) : ''
}

/** Today as yyyy-mm-dd — latest allowed "payment received" date. */
function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Tomorrow as yyyy-mm-dd — earliest allowed next draft date. */
function tomorrowDateInput(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-olive-600 dark:text-olive-500">{label}</dt>
      <dd className="text-sm text-olive-950 dark:text-white">{value}</dd>
    </div>
  )
}

const welcomeCopy: Record<string, string> = {
  sent: 'Welcome email sent with a new temporary password.',
  failed: 'Password was reset, but the email failed to send — resend or share access another way.',
  notfound: 'Could not find that user account.',
}

const overrideCopy: Record<string, { ok: boolean; text: string }> = {
  identity: { ok: true, text: 'Identity marked as verified manually.' },
  fee: { ok: true, text: 'Application fee marked as collected offline.' },
  confirm: { ok: false, text: 'Check the confirmation box to apply the override.' },
}

const paystubCopy: Record<string, { ok: boolean; text: string }> = {
  saved: { ok: true, text: 'Paystub saved securely. Review it, then record the verified income below.' },
  missing: { ok: false, text: 'Choose a file to upload.' },
  'too-big': { ok: false, text: 'That file is over 4 MB — please upload a smaller scan or photo.' },
  'bad-type': { ok: false, text: 'Only PDF, JPEG, PNG or WebP files are accepted.' },
}

const resetCopy: Record<string, { ok: boolean; text: string }> = {
  done: { ok: true, text: 'Verification progress was reset — the tenant was emailed to start the flow again.' },
  confirm: { ok: false, text: 'Check the confirmation box to reset verification.' },
  billing: {
    ok: false,
    text: 'Reset is blocked while rent collection exists — cancel or replace the subscription first.',
  },
}

export default async function AdminTenantReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ welcome?: string; reset?: string; override?: string; paystub?: string }>
}) {
  await requireRole('admin', '/admin/login')
  const { id } = await params
  const { welcome, reset, override, paystub } = await searchParams
  const t = await getTenantById(id)
  if (!t) notFound()
  const referredFrom = t.interestedPropertyId ? await getPropertyById(t.interestedPropertyId) : null
  const program = programOf(t)
  // Current per-draft base split into rent vs car (rent-only billing = all rent).
  const currentSplitDollars = t.billing
    ? {
        rentDollars: (t.billing.split?.rentCents ?? t.billing.baseAmountCents) / 100,
        carDollars: (t.billing.split?.carCents ?? 0) / 100,
      }
    : { rentDollars: 0, carDollars: 0 }
  // Affordability check prefers verified income, falling back to what they reported.
  const incomeForCheck = t.employment.verifiedMonthlyIncome ?? t.employment.monthlyIncome
  const incomeLabel = t.employment.verifiedMonthlyIncome != null ? 'verified' : 'reported'
  const rentOverBudget = t.landlord
    ? rentExceedsAffordable(t.landlord.monthlyRentCents / 100, incomeForCheck)
    : false
  // Live rent terms + unused credit straight from Stripe (null if Stripe is unreachable).
  const [liveRent, creditCents] = t.billing
    ? await Promise.all([
        getRentSubscriptionState(t.billing.stripeSubscriptionId),
        t.stripeCustomerId ? getCustomerCreditCents(t.stripeCustomerId) : Promise.resolve(null),
      ])
    : [null, null]
  const nextDraftAt = liveRent?.nextDraftAt ?? t.billing?.nextDraftAt ?? t.billing?.firstDraftAt
  // Program ledger (non-Effort-Exchange programs): rent held for landlords + car-program payments.
  const holdsFunds = !PROGRAMS[program].managedHousing
  const [funds, ledger, cars] = holdsFunds
    ? await Promise.all([balancesFor(t.id), listLedger(t.id, 25), listCarAssignments(t.id)])
    : [null, [], []]
  const activeCar = cars.find((c) => c.status === 'active')
  // Car trust period: CAR_TRUST_MONTHS from the first car payment (lib/programs.ts).
  const carEligibleDate = funds ? carEligibleOn(funds.firstCarPaymentAt) : null
  const carTrusted = funds ? carTrustComplete(funds.firstCarPaymentAt) : false
  const rentReserve = funds && PROGRAMS[program].outsideLandlord ? await rentFunds(t) : null
  // Per-paycheck collection + statements (feature-flagged; lib/paychecks.ts, lib/statements.ts).
  const paycheckOn = paycheckCollectionEnabled()
  const [deposits, statements, statementSummary, plaidMonthly, stripeBank] =
    paycheckOn && t.bankLink
      ? await Promise.all([
          listDeposits(t.id, 40),
          listStatementsForTenant(t.id),
          summarizeTenantStatements(t.id),
          monthlyDepositTotals(t.id),
          t.defaultPaymentMethodId ? getBankAccountLast4(t.defaultPaymentMethodId) : Promise.resolve(null),
        ])
      : [[], [], null, new Map<string, number>(), null]
  const accountsMatch = Boolean(stripeBank && t.bankLink?.mask && stripeBank.last4 === t.bankLink.mask)
  // e.g. "visa •••• 4242" — never the full number.
  const pmLabel = t.defaultPaymentMethodId ? await paymentMethodLabel(t.defaultPaymentMethodId) : null

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Breadcrumbs
            className="mb-2"
            items={[
              { label: 'Admin dashboard', href: '/admin' },
              { label: 'Tenant applications', href: '/admin/tenants' },
              { label: t.name },
            ]}
          />
          <Eyebrow>Administration</Eyebrow>
          <Subheading className="text-3xl/9 sm:text-4xl/12">{t.name}</Subheading>
        </div>

        {t.flaggedForReview && (
          <div className="rounded-xl bg-red-500/10 px-4 py-3 ring-1 ring-red-500/30">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">⚠️ Flagged for security review</p>
            {t.reviewReason && <p className="text-sm text-red-700 dark:text-red-400">{t.reviewReason}</p>}
          </div>
        )}

        {welcome && welcomeCopy[welcome] && (
          <p
            role="status"
            className={
              welcome === 'sent'
                ? 'text-sm text-olive-700 dark:text-olive-300'
                : 'text-sm text-red-600 dark:text-red-400'
            }
          >
            {welcomeCopy[welcome]}
          </p>
        )}

        {override && overrideCopy[override] && (
          <p
            role="status"
            className={
              overrideCopy[override].ok
                ? 'text-sm text-olive-700 dark:text-olive-300'
                : 'text-sm text-red-600 dark:text-red-400'
            }
          >
            {overrideCopy[override].text}
          </p>
        )}

        {reset && resetCopy[reset] && (
          <p
            role="status"
            className={
              resetCopy[reset].ok ? 'text-sm text-olive-700 dark:text-olive-300' : 'text-sm text-red-600 dark:text-red-400'
            }
          >
            {resetCopy[reset].text}
          </p>
        )}

        <Card className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Account access</h3>
          <p className="text-sm text-olive-600 dark:text-olive-500">
            Email this tenant a new temporary password and sign-in link. They’ll be prompted to set their own password.
            Useful for imported tenants or anyone who lost access.
          </p>
          <form action={resendWelcomeEmailAction}>
            <input type="hidden" name="userId" value={t.userId} />
            <input type="hidden" name="returnTo" value={`/admin/tenants/${t.id}`} />
            <SoftButton type="submit" className="w-fit">
              Resend welcome email
            </SoftButton>
          </form>
        </Card>

        {referredFrom && (
          <Card className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Referred from a property</h3>
            <p className="text-sm text-olive-950 dark:text-white">{formatAddress(referredFrom.address)}</p>
            <p className="text-sm text-olive-600 dark:text-olive-500">
              Invited with this home in mind (a hint only — no move-in request was filed).{' '}
              <Link href={`/properties/${referredFrom.id}`}>View property</Link>
            </p>
          </Card>
        )}

        {/* Program-change request (tenant requests → admin approves; app/actions/program-change.ts) */}
        {t.programChange?.status === 'pending' && (
          <Card id="program-change" className="flex flex-col gap-3 ring-amber-500/40">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Program change requested</h3>
            <p className="text-sm text-olive-950 dark:text-white">
              {PROGRAMS[t.programChange.from].label} → <strong>{PROGRAMS[t.programChange.to].label}</strong> (
              {rateSummary(t.programChange.to)}) · requested {new Date(t.programChange.requestedAt).toLocaleDateString()}
            </p>
            {t.programChange.note && (
              <p className="text-sm text-olive-600 dark:text-olive-500">Tenant’s note: {t.programChange.note}</p>
            )}
            {t.programChange.landlord && (
              <p className="text-sm text-olive-700 dark:text-olive-300">
                New landlord: {t.programChange.landlord.name} · {t.programChange.landlord.phone} · rent{' '}
                {formatCents(t.programChange.landlord.monthlyRentCents)}/mo
                {t.programChange.hasPendingLease && (
                  <>
                    {' · '}
                    <Link href={`/admin/tenants/${t.id}/lease?pending=1`} target="_blank" rel="noopener">
                      View submitted lease
                    </Link>
                  </>
                )}
              </p>
            )}
            <p className="text-xs text-olive-600 dark:text-olive-500">
              Approving switches the program. Fixed-draft tenants are re-priced to the new program’s rate from their next
              draft; paycheck-mode tenants use the new rate on their next paycheck.
            </p>
            <ProgramChangeReview tenantId={t.id} />
          </Card>
        )}

        {/* Program + (own-landlord) landlord & lease. Program rules: lib/programs.ts */}
        <Card className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Program</h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Row label="Program" value={PROGRAMS[program].label} />
            <Row label="Collects" value={`${rateSummary(program)} of pay`} />
            {t.landlord && (
              <>
                <Row label="Landlord" value={t.landlord.name} />
                <Row label="Landlord phone" value={t.landlord.phone} />
                <Row label="Landlord email" value={t.landlord.email ?? '—'} />
                <Row label="Monthly rent (per applicant)" value={formatCents(t.landlord.monthlyRentCents)} />
                <div className="sm:col-span-2">
                  <Row label="Landlord receives rent at" value={t.landlord.paymentAddress ?? '—'} />
                </div>
              </>
            )}
          </dl>
          {PROGRAMS[program].outsideLandlord && (
            <p className="text-sm text-olive-950 dark:text-white">
              Lease:{' '}
              {t.lease ? (
                <>
                  <Link href={`/admin/tenants/${t.id}/lease`} target="_blank" rel="noopener">
                    View lease
                  </Link>{' '}
                  <span className="text-olive-600 dark:text-olive-500">
                    (uploaded {new Date(t.lease.uploadedAt).toLocaleDateString()})
                  </span>
                </>
              ) : (
                <span className="text-amber-700 dark:text-amber-400">No lease on file — ask the tenant for one.</span>
              )}
            </p>
          )}
          {t.landlord && rentOverBudget && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              ⚠️ Rent is more than {pct(PROGRAMS[program].rentRate)}% of {incomeLabel} income — expect monthly shortfalls.
              Recommend a home they can afford.
            </p>
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Head of household</h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Row label="Name" value={t.name} />
            <Row label="Date of birth" value={t.dob} />
            <Row label="Email" value={t.email} />
            <Row label="Phone" value={t.phone} />
            <div className="sm:col-span-2">
              <Row label="Current address" value={formatAddress(t.address)} />
            </div>
          </dl>
        </Card>

        <Card className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">
            Household ({1 + t.adults.length + t.children.length})
          </h3>
          <div>
            <p className="text-sm font-medium text-olive-700 dark:text-olive-400">Other adults (18+)</p>
            {t.adults.length === 0 ? (
              <p className="text-sm text-olive-600 dark:text-olive-500">None</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1 text-sm text-olive-950 dark:text-white">
                {t.adults.map((a, i) => (
                  <li key={i}>{a.name} · {a.dob}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-olive-700 dark:text-olive-400">Children</p>
            {t.children.length === 0 ? (
              <p className="text-sm text-olive-600 dark:text-olive-500">None</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1 text-sm text-olive-950 dark:text-white">
                {t.children.map((c, i) => (
                  <li key={i}>{c.name} · {c.dob}</li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Employment</h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Row label="Employer" value={t.employment.employer} />
            <Row label="Job title" value={t.employment.jobTitle} />
            <Row label="Reported income" value={formatCurrency(t.employment.monthlyIncome)} />
            <Row label="Employer phone" value={t.employment.employerPhone ?? '—'} />
            <Row
              label="Employment type"
              value={
                t.employment.selfEmployed
                  ? `Self-employed${t.employment.claimedHourlyRate ? ` · claims ${formatCurrency(t.employment.claimedHourlyRate)}/hr` : ''}`
                  : 'Employed (payroll)'
              }
            />
            <Row
              label="Income verification"
              value={
                t.employment.verified
                  ? t.employment.verificationMethod === 'manual'
                    ? 'Verified manually by admin'
                    : 'Verified via Plaid'
                  : t.paystub
                    ? 'Paystub uploaded'
                    : 'Not yet verified'
              }
            />
            <Row
              label="Verified gross income"
              value={
                t.employment.verifiedMonthlyIncome ? `${formatCurrency(t.employment.verifiedMonthlyIncome)}/mo` : '—'
              }
            />
            <Row
              label="Verified hours/week"
              value={
                t.employment.verifiedWeeklyHours != null ? (
                  <span
                    className={
                      t.employment.verifiedWeeklyHours >= REQUIRED_WEEKLY_HOURS
                        ? 'text-green-700 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }
                  >
                    {t.employment.verifiedWeeklyHours} hrs ·{' '}
                    {t.employment.verifiedWeeklyHours >= REQUIRED_WEEKLY_HOURS
                      ? `meets ${REQUIRED_WEEKLY_HOURS}`
                      : `below ${REQUIRED_WEEKLY_HOURS}`}
                  </span>
                ) : (
                  '—'
                )
              }
            />
            {t.paystub && (
              <div className="sm:col-span-2">
                <Row
                  label="Paystub (admin upload)"
                  value={
                    t.paystub.url ? (
                      // Legacy record from the old tenant self-upload (public Blob URL).
                      <span className="text-red-600 dark:text-red-400">
                        Legacy public upload —{' '}
                        <a href={t.paystub.url} target="_blank" rel="noopener noreferrer" className="underline">
                          view
                        </a>
                        , then re-upload it below and delete the old file from Vercel Blob.
                      </span>
                    ) : (
                      <a
                        href={`/admin/tenants/${t.id}/paystub`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-olive-700 underline dark:text-olive-300"
                      >
                        View paystub (uploaded {t.paystub.uploadedAt.toLocaleDateString()})
                      </a>
                    )
                  }
                />
              </div>
            )}
          </dl>
          {paystub && paystubCopy[paystub] && (
            <p
              role="status"
              className={
                paystubCopy[paystub].ok
                  ? 'text-sm text-olive-700 dark:text-olive-300'
                  : 'text-sm text-red-600 dark:text-red-400'
              }
            >
              {paystubCopy[paystub].text}
            </p>
          )}
          {/* Last resort only: tenants must use Plaid. The file is encrypted and never gets a public URL. */}
          <form
            action={uploadPaystubAction}
            className="flex flex-col gap-2 rounded-xl bg-olive-950/5 p-4 dark:bg-white/5"
          >
            <input type="hidden" name="tenantId" value={t.id} />
            <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
              Upload paystub (last resort — only if Plaid can’t verify this tenant)
              <input
                type="file"
                name="paystub"
                required
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="text-base text-olive-700 sm:text-sm dark:text-olive-300"
              />
            </label>
            <span className="text-xs text-olive-600 dark:text-olive-500">
              PDF, JPEG, PNG or WebP, up to 4 MB. Stored encrypted; replaces any previous paystub.
            </span>
            <SoftButton type="submit" className="w-fit">
              Save paystub
            </SoftButton>
          </form>
          <EmploymentTypeForm
            tenantId={t.id}
            selfEmployed={Boolean(t.employment.selfEmployed)}
            hourlyRate={t.employment.claimedHourlyRate}
          />
          {!t.employment.verified && (
            <IncomeVerifyForm
              tenantId={t.id}
              requiredWeeklyHours={REQUIRED_WEEKLY_HOURS}
              reportedMonthlyIncome={t.employment.monthlyIncome}
            />
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Application</h3>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Row label="Status" value={statusLabel[t.status]} />
            <Row
              label="Fee"
              value={`${feeLabel[t.fee.status]}${t.fee.offline ? ' (offline)' : ''} · ${formatCurrency(t.fee.amountCents / 100)}`}
            />
            <Row label="Payment method" value={t.defaultPaymentMethodId ? (pmLabel ?? 'On file') : '—'} />
            <Row
              label="Rent collection"
              value={
                t.billing
                  ? `${formatCurrency(t.billing.amountCents / 100)} ${frequencyLabel[t.billing.frequency]} · ${t.billing.status}`
                  : 'Not started'
              }
            />
            <Row
              label="Identity (ID + selfie)"
              value={
                t.identityVerified
                  ? t.identityManual
                    ? 'Verified manually by admin'
                    : `Verified${t.idNumberLast4 ? ` · •••• ${t.idNumberLast4}` : ''}`
                  : 'Not verified'
              }
            />
          </dl>
          {t.status === 'rejected' && t.rejectionReason && (
            <p className="text-sm text-red-600 dark:text-red-400">Reason: {t.rejectionReason}</p>
          )}
        </Card>

        {/* Manual Stripe link — for tenants who already pay through Stripe outside the app's checkout. */}
        <Card className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Stripe link</h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Row
              label="Customer"
              value={t.stripeCustomerId ? <span className="font-mono">{t.stripeCustomerId}</span> : 'Not linked'}
            />
            <Row
              label="Payment method"
              value={
                t.defaultPaymentMethodId ? (
                  <span>
                    {pmLabel ?? 'Not found in Stripe'} <span className="font-mono text-xs">({t.defaultPaymentMethodId})</span>
                  </span>
                ) : (
                  'None on file'
                )
              }
            />
          </dl>
          <StripeLinkForm tenantId={t.id} customerId={t.stripeCustomerId} />
        </Card>

        {(!t.identityVerified || t.fee.status !== 'paid') && (
          <Card className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Manual overrides</h3>
            <p className="text-sm text-olive-600 dark:text-olive-500">
              For paper applications and tenants imported from Stripe: approval normally requires Stripe Identity (ID +
              selfie) and the in-app fee payment. If you verified these yourself, record that here to unblock approval.
            </p>
            {!t.identityVerified && (
              <form action={markIdentityVerifiedManuallyAction} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={t.id} />
                <label className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-olive-950 ring-1 ring-amber-500/30 dark:text-white">
                  <input type="checkbox" name="confirm" className="mt-1" />
                  <span>
                    I personally checked this tenant’s government ID and it matches the application. This bypasses the
                    automated Stripe Identity check.
                  </span>
                </label>
                <SoftButton type="submit" className="w-fit">
                  Mark identity verified manually
                </SoftButton>
              </form>
            )}
            {t.fee.status !== 'paid' && (
              <form action={markFeeCollectedOfflineAction} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={t.id} />
                <label className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-olive-950 ring-1 ring-amber-500/30 dark:text-white">
                  <input type="checkbox" name="confirm" className="mt-1" />
                  <span>The $25 application fee was collected outside the app (cash or directly in Stripe).</span>
                </label>
                <SoftButton type="submit" className="w-fit">
                  Mark fee collected offline
                </SoftButton>
              </form>
            )}
          </Card>
        )}

        {t.status === 'pending' && (
          <Card className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Decision</h3>
            <TenantReviewActions
              tenantId={t.id}
              feePaid={t.fee.status === 'paid'}
              identityVerified={Boolean(t.identityVerified)}
            />
          </Card>
        )}

        {t.status === 'approved' && (
          <Card className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Rent collection</h3>
            {t.billing ? (
              <>
                <dl className="grid gap-4 sm:grid-cols-3">
                  <Row label="Amount" value={`${formatCents(t.billing.amountCents)} ${frequencyLabel[t.billing.frequency]}`} />
                  <Row label="Base (before fee)" value={formatCents(t.billing.baseAmountCents)} />
                  {t.billing.split && (
                    <Row
                      label="Split"
                      value={`${formatCents(t.billing.split.rentCents)} rent + ${formatCents(t.billing.split.carCents)} car program`}
                    />
                  )}
                  <Row label="Status" value={t.billing.status} />
                  <Row label="First draft" value={new Date(t.billing.firstDraftAt).toLocaleDateString()} />
                  <Row label="Next draft" value={nextDraftAt ? new Date(nextDraftAt).toLocaleDateString() : '—'} />
                  <Row label="Unused credit" value={creditCents === null ? 'Unavailable (Stripe)' : formatCents(creditCents)} />
                </dl>
                {liveRent && liveRent.amountCents !== t.billing.amountCents && (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    ⚠️ Stripe is charging {formatCents(liveRent.amountCents)} per draft, which differs from our record — it
                    was likely changed in the Stripe dashboard. Saving changes below brings them back in sync.
                  </p>
                )}
                {t.billing.imported && t.billing.status !== 'canceled' && (
                  <div className="flex flex-col items-start gap-2 rounded-lg bg-olive-950/5 p-3 dark:bg-white/5">
                    <span className="rounded-full bg-olive-950/10 px-2 py-0.5 text-xs font-semibold text-olive-700 dark:bg-white/10 dark:text-olive-300">
                      Imported from Stripe
                    </span>
                    <p className="text-sm text-olive-600 dark:text-olive-500">
                      Amount and schedule come from the existing Stripe subscription. You can change them below (the app then
                      manages it), or replace it with the program-rate model — which cancels this subscription and returns the
                      tenant to standard rent setup.
                    </p>
                    <form action={replaceImportedWithBillingAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <SoftButton type="submit" className="text-red-600 dark:text-red-400">
                        Replace with program-rate model
                      </SoftButton>
                    </form>
                  </div>
                )}
                {/* Income-check pause (or legacy pause with no source): needs income reconfirmed. */}
                {t.billing.status === 'paused' && t.billing.pause?.source !== 'admin' && (
                  <div className="flex flex-col gap-2 rounded-lg bg-amber-500/10 p-3 ring-1 ring-amber-500/30">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      Rent is paused — the monthly income check found no recent income. Reconfirm the tenant still has
                      income before resuming; the next draft won’t occur until you do.
                    </p>
                    <form action={resumeTenantBillingAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <Button type="submit" className="w-fit">
                        Reconfirm income &amp; resume rent
                      </Button>
                    </form>
                  </div>
                )}

                {/* Canceled: Stripe can't reactivate, so restart = a new subscription (app/actions/rent.ts). */}
                {t.billing.status === 'canceled' && (
                  <div className="flex flex-col gap-3 rounded-lg bg-red-500/5 p-4 ring-1 ring-red-500/20">
                    <h4 className="font-semibold text-olive-950 dark:text-white">Restart rent collection</h4>
                    <p className="text-sm text-olive-600 dark:text-olive-500">
                      This tenant’s subscription is canceled. Restarting creates a new subscription on their saved
                      payment method (or the default one on their Stripe customer). The old record is kept in history.
                    </p>
                    {PROGRAMS[program].managedHousing && !t.currentPropertyId && (
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                        ⚠️ This tenant isn’t placed in a property, so rent will collect but no partner equity accrues.
                        Approve a move-in first if they live in one of our homes.
                      </p>
                    )}
                    <RentAdjustForm
                      mode="restart"
                      tenantId={t.id}
                      nonce={randomUUID()}
                      current={{ ...currentSplitDollars, frequency: t.billing.frequency, nextDraft: '' }}
                      minDate={tomorrowDateInput()}
                      program={program}
                      monthlyIncome={t.employment.verifiedMonthlyIncome}
                    />
                  </div>
                )}

                {/* Admin pause / resume — prefer this over canceling. */}
                {(t.billing.status === 'active' ||
                  t.billing.status === 'past_due' ||
                  (t.billing.status === 'paused' && t.billing.pause?.source === 'admin')) && (
                  <div className="flex flex-col gap-3 border-t border-olive-950/10 pt-4 dark:border-white/10">
                    <h4 className="font-semibold text-olive-950 dark:text-white">
                      {t.billing.status === 'paused' ? 'Rent is paused' : 'Pause rent'}
                    </h4>
                    <RentPauseForm
                      tenantId={t.id}
                      nonce={randomUUID()}
                      minDate={tomorrowDateInput()}
                      paused={
                        t.billing.status === 'paused' && t.billing.pause
                          ? {
                              since: new Date(t.billing.pause.at).toLocaleDateString(),
                              reason: t.billing.pause.reason,
                              resumesOn: t.billing.pause.resumesAt
                                ? new Date(t.billing.pause.resumesAt).toLocaleDateString()
                                : undefined,
                            }
                          : undefined
                      }
                    />
                  </div>
                )}

                {t.billing.status !== 'canceled' && (
                  <>
                    <div className="flex flex-col gap-3 border-t border-olive-950/10 pt-4 dark:border-white/10">
                      <h4 className="font-semibold text-olive-950 dark:text-white">Change amount, frequency or date</h4>
                      <RentAdjustForm
                        tenantId={t.id}
                        nonce={randomUUID()}
                        current={{ ...currentSplitDollars, frequency: t.billing.frequency, nextDraft: futureDateInput(nextDraftAt) }}
                        minDate={tomorrowDateInput()}
                        program={program}
                        monthlyIncome={t.employment.verifiedMonthlyIncome}
                      />
                    </div>

                    <div className="flex flex-col gap-3 border-t border-olive-950/10 pt-4 dark:border-white/10">
                      <h4 className="font-semibold text-olive-950 dark:text-white">Add credit for a payment made another way</h4>
                      {t.stripeCustomerId ? (
                        <RentCreditForm
                          tenantId={t.id}
                          nonce={randomUUID()}
                          nextDraftCents={liveRent?.amountCents ?? t.billing.amountCents}
                          today={todayDateInput()}
                        />
                      ) : (
                        <p className="text-sm text-red-600 dark:text-red-400">No Stripe customer on file to credit.</p>
                      )}
                    </div>
                  </>
                )}

                {(t.rentCredits?.length ?? 0) > 0 && (
                  <div className="flex flex-col gap-1 border-t border-olive-950/10 pt-4 dark:border-white/10">
                    <h4 className="font-semibold text-olive-950 dark:text-white">Credits recorded</h4>
                    <ul className="text-sm text-olive-700 dark:text-olive-300">
                      {[...(t.rentCredits ?? [])].reverse().map((c) => (
                        <li key={c.stripeTransactionId}>
                          {new Date(c.receivedAt).toLocaleDateString()} — {formatCents(c.amountCents)}{' '}
                          {creditMethodLabel[c.method]}
                          {c.reference ? ` · ${c.reference}` : ''}
                          {c.note ? ` · ${c.note}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(t.billingHistory?.length ?? 0) > 0 && (
                  <div className="flex flex-col gap-1 border-t border-olive-950/10 pt-4 dark:border-white/10">
                    <h4 className="font-semibold text-olive-950 dark:text-white">Rent changes</h4>
                    <ul className="text-sm text-olive-700 dark:text-olive-300">
                      {[...(t.billingHistory ?? [])].reverse().map((h, i) => (
                        <li key={i}>
                          {new Date(h.at).toLocaleDateString()} — {formatCents(h.from.amountCents)}{' '}
                          {frequencyLabel[h.from.frequency]} → {formatCents(h.to.amountCents)}{' '}
                          {frequencyLabel[h.to.frequency]}, next draft {new Date(h.to.nextDraftAt).toLocaleDateString()}
                          {h.note ? ` · ${h.note}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : t.paycheck ? (
              <p className="text-sm text-olive-600 dark:text-olive-500">
                Collected per paycheck instead of a fixed schedule — see Paycheck collection below.
              </p>
            ) : !t.employment.verified ? (
              <p className="text-sm text-olive-600 dark:text-olive-500">
                Waiting on income verification — the tenant must connect their bank via Plaid (or, as a last resort, you
                upload their paystub and record the verified income above) before you can set up rent collection.
              </p>
            ) : !t.defaultPaymentMethodId ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                No saved payment method on file. The application fee must be paid (which saves the method), or link the
                tenant’s existing Stripe customer in “Stripe link” above, before rent can
                be drafted.
              </p>
            ) : (
              <>
                <p className="text-sm text-olive-600 dark:text-olive-500">
                  Income on file{' '}
                  {t.employment.verified
                    ? `(${t.employment.verificationMethod === 'manual' ? 'verified manually' : 'Plaid'}${t.employment.verifiedMonthlyIncome ? ` · ${formatCurrency(t.employment.verifiedMonthlyIncome)}/mo verified` : ''})`
                    : ''}
                  . Choose the frequency, confirm the amounts and the first draft date.
                </p>
                {t.employment.verifiedWeeklyHours != null && t.employment.verifiedWeeklyHours < REQUIRED_WEEKLY_HOURS && (
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">
                    ⚠️ Verified at {t.employment.verifiedWeeklyHours} hrs/week — below the {REQUIRED_WEEKLY_HOURS}-hour
                    program requirement. Confirm before starting collection.
                  </p>
                )}
                <TenantBillingForm
                  tenantId={t.id}
                  program={program}
                  monthlyIncome={t.employment.verifiedMonthlyIncome}
                />
              </>
            )}
          </Card>
        )}

        {paycheckOn && t.status === 'approved' && (
          <Card id="paycheck" className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Paycheck collection</h3>
            {!t.bankLink ? (
              <p className="text-sm text-olive-600 dark:text-olive-500">
                The tenant hasn’t connected their paycheck account yet (they see the prompt in their portal).
              </p>
            ) : (
              <>
                <dl className="grid gap-4 sm:grid-cols-3">
                  <Row
                    label="Bank connection"
                    value={`${t.bankLink.status}${t.bankLink.statusReason ? ` (${t.bankLink.statusReason})` : ''} · ••${t.bankLink.mask ?? '??'}`}
                  />
                  <Row
                    label="Stripe debit account"
                    value={
                      stripeBank
                        ? `••${stripeBank.last4} ${accountsMatch ? '✓ same account' : '✗ does NOT match'}`
                        : 'Not a bank account'
                    }
                  />
                  <Row
                    label="Mode"
                    value={
                      t.paycheck
                        ? `${t.paycheck.status}${t.paycheck.pausedReason ? ` — ${t.paycheck.pausedReason}` : ''}`
                        : t.billing && t.billing.status !== 'canceled'
                          ? 'Fixed schedule'
                          : 'Not started'
                    }
                  />
                  <Row
                    label="Authorization"
                    value={
                      t.paycheckAuthorization
                        ? `Accepted ${new Date(t.paycheckAuthorization.acceptedAt).toLocaleDateString()} · max ${formatCents(t.paycheckAuthorization.rangeMaxCents)}`
                        : 'Not yet'
                    }
                  />
                  <Row
                    label="Collect from"
                    value={t.paycheck ? new Date(t.paycheck.collectFrom).toLocaleDateString() : '—'}
                  />
                  <Row
                    label="Last sync"
                    value={t.bankLink.lastSyncedAt ? new Date(t.bankLink.lastSyncedAt).toLocaleString() : '—'}
                  />
                </dl>
                <div className="flex flex-wrap items-start gap-4">
                  {t.paycheckAuthorization && !t.paycheck && (
                    <PaycheckActionForm action="switch" tenantId={t.id} label="Switch to paycheck collection" />
                  )}
                  {t.paycheck?.status === 'active' && (
                    <PaycheckActionForm action="pause" tenantId={t.id} label="Pause" soft withReason />
                  )}
                  {t.paycheck?.status === 'paused' && (
                    <PaycheckActionForm action="resume" tenantId={t.id} label="Resume" />
                  )}
                  <PaycheckActionForm action="sync" tenantId={t.id} label="Sync now" soft />
                </div>
                {deposits.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="text-olive-600 dark:text-olive-500">
                        <tr>
                          <th className="py-1 pr-3 font-medium">Date</th>
                          <th className="py-1 pr-3 font-medium">Deposit</th>
                          <th className="py-1 pr-3 font-medium">From</th>
                          <th className="py-1 pr-3 font-medium">Status</th>
                          <th className="py-1 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="text-olive-950 dark:text-white">
                        {deposits
                          .filter((d) => d.status !== 'history')
                          .map((d) => (
                            <tr key={d.id} className="border-t border-olive-950/10 dark:border-white/10">
                              <td className="py-1 pr-3">{d.date}</td>
                              <td className="py-1 pr-3">{formatCents(d.amountCents)}</td>
                              <td className="py-1 pr-3">{d.payer ?? '—'}</td>
                              <td className="py-1 pr-3">
                                {d.status} <span className="text-olive-600 dark:text-olive-500">({d.reason.replace(/_/g, ' ')})</span>
                                {d.collection?.chargedCents ? ` · ${formatCents(d.collection.chargedCents)}` : ''}
                                {d.collection?.failureCode ? ` · ${d.collection.failureCode}` : ''}
                              </td>
                              <td className="py-1">
                                {(d.status === 'review' || d.status === 'failed' || d.status === 'queued') && (
                                  <div className="flex gap-2">
                                    {d.status !== 'queued' && (
                                      <form action={decideDepositAction}>
                                        <input type="hidden" name="depositId" value={d.id} />
                                        <input type="hidden" name="decision" value="include" />
                                        <SoftButton type="submit">{d.status === 'failed' ? 'Retry' : 'Include'}</SoftButton>
                                      </form>
                                    )}
                                    <form action={decideDepositAction}>
                                      <input type="hidden" name="depositId" value={d.id} />
                                      <input type="hidden" name="decision" value="ignore" />
                                      <SoftButton type="submit" className="text-red-600 dark:text-red-400">
                                        Ignore
                                      </SoftButton>
                                    </form>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Bank statements — income fallback when payroll can't be found (Phase 7 / 7b) */}
                <div className="flex flex-col gap-3 border-t border-olive-950/10 pt-4 dark:border-white/10">
                  <h4 className="font-semibold text-olive-950 dark:text-white">Bank statements (income review)</h4>
                  <p className="text-sm text-olive-600 dark:text-olive-500">
                    For tenants whose payroll can’t be found. Status: {t.bankLink.statements?.status ?? 'not requested'}.
                    Statements are stored encrypted and deleted automatically after 180 days.
                  </p>
                  <div className="flex flex-wrap items-start gap-4">
                    <PaycheckActionForm action="fetchStatements" tenantId={t.id} label="Fetch statements" soft />
                    {statements.length > 0 && (
                      <PaycheckActionForm action="analyze" tenantId={t.id} label="Read with AI" soft withForce />
                    )}
                  </div>
                  {statements.length > 0 && (
                    <ul className="text-sm text-olive-700 dark:text-olive-300">
                      {statements.map((st) => (
                        <li key={st.id}>
                          <Link href={`/admin/tenants/${t.id}/statements/${st.id}`} target="_blank" rel="noopener">
                            {st.year}-{String(st.month).padStart(2, '0')} statement
                          </Link>{' '}
                          ··{st.accountMask ?? '??'} {st.analyzedAt ? '· read by AI' : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  {statementSummary && statementSummary.months.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <dl className="grid gap-4 sm:grid-cols-2">
                        <Row label="Avg monthly deposits (excl. own transfers)" value={formatCents(statementSummary.avgMonthlyDepositsCents)} />
                        <Row label="Avg monthly pay" value={formatCents(statementSummary.avgMonthlyPayCents)} />
                      </dl>
                      <table className="w-full text-left text-sm">
                        <thead className="text-olive-600 dark:text-olive-500">
                          <tr>
                            <th className="py-1 pr-3 font-medium">Month</th>
                            <th className="py-1 pr-3 font-medium">Deposits (AI lines)</th>
                            <th className="py-1 pr-3 font-medium">Pay</th>
                            <th className="py-1 pr-3 font-medium">Plaid saw</th>
                            <th className="py-1 font-medium">Check</th>
                          </tr>
                        </thead>
                        <tbody className="text-olive-950 dark:text-white">
                          {statementSummary.months.map((m) => {
                            const plaid = plaidMonthly.get(m.label)
                            const off = plaid != null && Math.abs(plaid - m.totalDepositsCents) > Math.max(5000, plaid * 0.1)
                            return (
                              <tr key={m.statementId} className="border-t border-olive-950/10 dark:border-white/10">
                                <td className="py-1 pr-3">{m.label}</td>
                                <td className="py-1 pr-3">{formatCents(m.totalDepositsCents)}</td>
                                <td className="py-1 pr-3">{formatCents(m.payDepositsCents)}</td>
                                <td className="py-1 pr-3">{plaid != null ? formatCents(plaid) : '—'}</td>
                                <td className="py-1">
                                  {off ? '⚠️ differs' : 'ok'}
                                  {m.lowConfidenceLines ? ` · ${m.lowConfidenceLines} unsure line(s)` : ''}
                                  {m.notes ? ` · ${m.notes}` : ''}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      <p className="text-xs text-olive-600 dark:text-olive-500">
                        Totals are added up by the app from the lines the AI read — open each statement to confirm. Then
                        record the verified monthly income with the income form above. The AI doesn’t approve or set
                        amounts.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>
        )}

        {funds && (
          <Card className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Program money</h3>
            <dl className="grid gap-4 sm:grid-cols-3">
              {PROGRAMS[program].outsideLandlord && (
                <>
                  <Row label="Available rent funds" value={formatCents(funds.rentHeldCents)} />
                  {rentReserve && (
                    <Row
                      label="Reserve beyond this month"
                      value={`${formatCents(rentReserve.reserveCents)}${rentReserve.upgradeReady ? ' · upgrade-ready' : ''}`}
                    />
                  )}
                  <Row label="Rent collected (all time)" value={formatCents(funds.rentCollectedCents)} />
                  <Row label="Paid to landlord (all time)" value={formatCents(funds.landlordPaidCents)} />
                </>
              )}
              {PROGRAMS[program].carRate > 0 && (
                <>
                  <Row
                    label="Car payments (kept by edynsgate)"
                    value={`${funds.carPaymentCount} · ${formatCents(funds.carPaidCents)}`}
                  />
                  <Row
                    label="First car payment"
                    value={funds.firstCarPaymentAt ? new Date(funds.firstCarPaymentAt).toLocaleDateString() : '—'}
                  />
                  <Row
                    label={`Trust period (${CAR_TRUST_MONTHS} months)`}
                    value={
                      carEligibleDate
                        ? carTrusted
                          ? 'Complete'
                          : `Ends ${carEligibleDate.toLocaleDateString()}`
                        : 'Not started'
                    }
                  />
                </>
              )}
            </dl>

            {rentReserve?.upgradeReady && (
              <p className="text-sm font-medium text-olive-950 dark:text-white">
                Upgrade-ready: their reserve is at least {UPGRADE_RESERVE_MONTHS} months of rent. Consider offering a
                nicer home (higher tier). Funds stay with edynsgate and aren’t refundable.
              </p>
            )}

            {t.shortfall && (
              <p className={t.shortfall.paidAt ? 'text-sm text-olive-700 dark:text-olive-300' : 'text-sm text-amber-700 dark:text-amber-400'}>
                Shortfall notice for {t.shortfall.month}: {formatCents(t.shortfall.amountCents)} — emailed{' '}
                {new Date(t.shortfall.notifiedAt).toLocaleDateString()}
                {t.shortfall.paidAt ? `, paid by tenant ${new Date(t.shortfall.paidAt).toLocaleDateString()}` : ', unpaid'}.
              </p>
            )}

            {PROGRAMS[program].outsideLandlord && (
              <div className="flex flex-col gap-3 border-t border-olive-950/10 pt-4 dark:border-white/10">
                <h4 className="font-semibold text-olive-950 dark:text-white">Record a landlord payment</h4>
                <p className="text-sm text-olive-600 dark:text-olive-500">
                  Send the rent by bill pay, ACH or check outside the app, then record it here. You can only pay out
                  rent that has been collected.
                  {t.landlord?.paymentAddress ? ` Landlord receives rent at: ${t.landlord.paymentAddress}.` : ''}
                </p>
                <LandlordPaymentForm
                  tenantId={t.id}
                  nonce={randomUUID()}
                  today={todayDateInput()}
                  suggestedDollars={
                    t.landlord ? Math.min(t.landlord.monthlyRentCents, funds.rentHeldCents) / 100 || undefined : undefined
                  }
                />
              </div>
            )}

            {PROGRAMS[program].carRate > 0 && (
              <div id="car" className="flex flex-col gap-3 border-t border-olive-950/10 pt-4 dark:border-white/10">
                <h4 className="font-semibold text-olive-950 dark:text-white">Car</h4>
                {activeCar ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-olive-950 dark:text-white">
                      <strong>{activeCar.vehicle}</strong>
                      {activeCar.plate ? ` · plate ${activeCar.plate}` : ''}
                      {activeCar.vin ? ` · VIN ${activeCar.vin}` : ''} — assigned{' '}
                      {new Date(activeCar.assignedAt).toLocaleDateString()}
                      {activeCar.early ? ' (early, before trust period)' : ''}
                    </p>
                    {activeCar.insurance && (
                      <p className="text-sm text-olive-600 dark:text-olive-500">
                        Insurance (paid by edynsgate): {activeCar.insurance}
                      </p>
                    )}
                    <p className="text-sm text-olive-600 dark:text-olive-500">
                      edynsgate owns this car. If the tenant stops paying or leaves the program, collect the car and
                      mark it returned.
                    </p>
                    <ReturnCarForm assignmentId={activeCar.id} />
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-olive-600 dark:text-olive-500">
                      {carTrusted
                        ? 'Trust period complete — assign a car edynsgate owns. Edynsgate pays its insurance.'
                        : `Cars are provided after ${CAR_TRUST_MONTHS} months of car payments${
                            carEligibleDate ? ` (${carEligibleDate.toLocaleDateString()})` : ''
                          }. You can provide one early if you trust the tenant.`}
                    </p>
                    <AssignCarForm tenantId={t.id} trusted={carTrusted} />
                  </>
                )}
                {cars.filter((c) => c.status === 'returned').length > 0 && (
                  <ul className="text-sm text-olive-700 dark:text-olive-300">
                    {cars
                      .filter((c) => c.status === 'returned')
                      .map((c) => (
                        <li key={c.id}>
                          {new Date(c.assignedAt).toLocaleDateString()} to{' '}
                          {c.returnedAt ? new Date(c.returnedAt).toLocaleDateString() : ''} — {c.vehicle} · returned
                          {c.returnReason ? ` (${c.returnReason})` : ''}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}

            {PROGRAMS[program].outsideLandlord && (
              <div className="flex flex-col gap-3 border-t border-olive-950/10 pt-4 dark:border-white/10">
                <h4 className="font-semibold text-olive-950 dark:text-white">Adjust available rent funds</h4>
                <LedgerAdjustmentForm tenantId={t.id} nonce={randomUUID()} />
              </div>
            )}

            {ledger.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-olive-950/10 pt-4 dark:border-white/10">
                <h4 className="font-semibold text-olive-950 dark:text-white">History</h4>
                <ul className="text-sm text-olive-700 dark:text-olive-300">
                  {ledger.map((e) => (
                    <li key={e.id}>
                      {new Date(e.at).toLocaleDateString()} — {ledgerKindLabel[e.kind]} ({e.bucket === 'rent' ? 'rent' : 'car'}){' '}
                      {formatCents(e.amountCents)}
                      {e.method ? ` · ${e.method.replace('_', ' ')}` : ''}
                      {e.reference ? ` · ${e.reference}` : ''}
                      {e.note ? ` · ${e.note}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        <Card className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Reset verification</h3>
          <p className="text-sm text-olive-600 dark:text-olive-500">
            For applicants stuck mid-verification: clears ALL verification progress — identity (ID + selfie), the Plaid
            bank connection and verified income, any uploaded paystub, the bank-link counter, and security flags — so
            the tenant can re-enter their info and start the flow over. Their application details, paid fee, saved
            payment method, and application status are kept. The tenant is emailed to try again.
          </p>
          {t.billing ? (
            <p className="text-sm text-olive-600 dark:text-olive-500">
              Unavailable while rent collection exists — the monthly income check relies on the bank connection. Cancel
              or replace the subscription first.
            </p>
          ) : (
            <form action={resetTenantVerificationAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={t.id} />
              <label className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-olive-950 ring-1 ring-amber-500/30 dark:text-white">
                <input type="checkbox" name="confirm" className="mt-1" />
                <span>
                  I understand this disconnects the tenant’s bank, voids any pending ID check, and the tenant must redo
                  verification from the start.
                </span>
              </label>
              <SoftButton type="submit" className="w-fit text-red-600 dark:text-red-400">
                Reset verification
              </SoftButton>
            </form>
          )}
        </Card>
      </Container>
    </section>
  )
}
