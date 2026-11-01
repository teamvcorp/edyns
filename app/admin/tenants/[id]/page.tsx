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
import { RentAdjustForm } from '@/components/admin/rent-adjust-form'
import { RentCreditForm } from '@/components/admin/rent-credit-form'
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
  COLLECTION_RATE,
  REQUIRED_WEEKLY_HOURS,
  getRentSubscriptionState,
  getCustomerCreditCents,
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
  // Live rent terms + unused credit straight from Stripe (null if Stripe is unreachable).
  const [liveRent, creditCents] = t.billing
    ? await Promise.all([
        getRentSubscriptionState(t.billing.stripeSubscriptionId),
        t.stripeCustomerId ? getCustomerCreditCents(t.stripeCustomerId) : Promise.resolve(null),
      ])
    : [null, null]
  const nextDraftAt = liveRent?.nextDraftAt ?? t.billing?.nextDraftAt ?? t.billing?.firstDraftAt

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
            <Row label="Payment method" value={t.defaultPaymentMethodId ? 'On file' : '—'} />
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
                  <Row label="Base (40%)" value={formatCents(t.billing.baseAmountCents)} />
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
                      manages it), or replace it with the 40% model — which cancels this subscription and returns the
                      tenant to standard rent setup.
                    </p>
                    <form action={replaceImportedWithBillingAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <SoftButton type="submit" className="text-red-600 dark:text-red-400">
                        Replace with 40% model
                      </SoftButton>
                    </form>
                  </div>
                )}
                {t.billing.status === 'paused' && (
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
                    {!t.currentPropertyId && (
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                        ⚠️ This tenant isn’t placed in a property, so rent will collect but no partner equity accrues.
                        Approve a move-in first if they live in one of our homes.
                      </p>
                    )}
                    <RentAdjustForm
                      mode="restart"
                      tenantId={t.id}
                      nonce={randomUUID()}
                      current={{
                        baseDollars: t.billing.baseAmountCents / 100,
                        frequency: t.billing.frequency,
                        nextDraft: '',
                      }}
                      minDate={tomorrowDateInput()}
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
                        current={{
                          baseDollars: t.billing.baseAmountCents / 100,
                          frequency: t.billing.frequency,
                          nextDraft: futureDateInput(nextDraftAt),
                        }}
                        minDate={tomorrowDateInput()}
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
            ) : !t.employment.verified ? (
              <p className="text-sm text-olive-600 dark:text-olive-500">
                Waiting on income verification — the tenant must connect their bank via Plaid (or, as a last resort, you
                upload their paystub and record the verified income above) before you can set up rent collection.
              </p>
            ) : !t.defaultPaymentMethodId ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                No saved payment method on file. The application fee must be paid (which saves the method) before rent can
                be drafted.
              </p>
            ) : (
              <>
                <p className="text-sm text-olive-600 dark:text-olive-500">
                  Income on file{' '}
                  {t.employment.verified
                    ? `(${t.employment.verificationMethod === 'manual' ? 'verified manually' : 'Plaid'}${t.employment.verifiedMonthlyIncome ? ` · ${formatCurrency(t.employment.verifiedMonthlyIncome)}/mo verified` : ''})`
                    : ''}
                  . Enter the recurring 40% amount, frequency, and first draft date.
                </p>
                {t.employment.verifiedWeeklyHours != null && t.employment.verifiedWeeklyHours < REQUIRED_WEEKLY_HOURS && (
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">
                    ⚠️ Verified at {t.employment.verifiedWeeklyHours} hrs/week — below the {REQUIRED_WEEKLY_HOURS}-hour
                    Effort Exchange requirement. Confirm before starting rent.
                  </p>
                )}
                <TenantBillingForm
                  tenantId={t.id}
                  suggestedAmount={
                    t.employment.verifiedMonthlyIncome
                      ? Math.round(t.employment.verifiedMonthlyIncome * COLLECTION_RATE * 100) / 100
                      : undefined
                  }
                />
              </>
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
