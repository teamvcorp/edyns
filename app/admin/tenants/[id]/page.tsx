import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import { getTenantById } from '@/lib/tenants'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Breadcrumbs } from '@/components/elements/breadcrumbs'
import { TenantReviewActions } from '@/components/admin/tenant-review-actions'
import { TenantBillingForm } from '@/components/admin/tenant-billing-form'
import { EmploymentTypeForm } from '@/components/admin/employment-type-form'
import { resumeTenantBillingAction, replaceImportedWithBillingAction } from '@/app/actions/admin'
import { Button, SoftButton } from '@/components/elements/button'
import { formatAddress, formatCurrency } from '@/lib/format'
import { COLLECTION_RATE, REQUIRED_WEEKLY_HOURS } from '@/lib/stripe'

export const metadata: Metadata = { title: 'Review application' }

const feeLabel = { unpaid: 'Unpaid', processing: 'Processing', paid: 'Paid' } as const
const statusLabel = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' } as const
const frequencyLabel = { weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly' } as const

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-olive-600 dark:text-olive-500">{label}</dt>
      <dd className="text-sm text-olive-950 dark:text-white">{value}</dd>
    </div>
  )
}

export default async function AdminTenantReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('admin', '/admin/login')
  const { id } = await params
  const t = await getTenantById(id)
  if (!t) notFound()

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
                  ? 'Verified via Plaid'
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
                  label="Uploaded paystub"
                  value={
                    <a
                      href={t.paystub.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-olive-700 underline dark:text-olive-300"
                    >
                      View paystub
                    </a>
                  }
                />
              </div>
            )}
          </dl>
          <EmploymentTypeForm
            tenantId={t.id}
            selfEmployed={Boolean(t.employment.selfEmployed)}
            hourlyRate={t.employment.claimedHourlyRate}
          />
        </Card>

        <Card className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Application</h3>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Row label="Status" value={statusLabel[t.status]} />
            <Row label="Fee" value={`${feeLabel[t.fee.status]} · ${formatCurrency(t.fee.amountCents / 100)}`} />
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
              value={t.identityVerified ? `Verified${t.idNumberLast4 ? ` · •••• ${t.idNumberLast4}` : ''}` : 'Not verified'}
            />
          </dl>
          {t.status === 'rejected' && t.rejectionReason && (
            <p className="text-sm text-red-600 dark:text-red-400">Reason: {t.rejectionReason}</p>
          )}
        </Card>

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
                  <Row label="Amount" value={`${formatCurrency(t.billing.amountCents / 100)} ${frequencyLabel[t.billing.frequency]}`} />
                  <Row label="Base (40%)" value={formatCurrency(t.billing.baseAmountCents / 100)} />
                  <Row label="Status" value={t.billing.status} />
                  <Row label="First draft" value={new Date(t.billing.firstDraftAt).toLocaleDateString()} />
                </dl>
                {t.billing.imported && (
                  <div className="flex flex-col items-start gap-2 rounded-lg bg-olive-950/5 p-3 dark:bg-white/5">
                    <span className="rounded-full bg-olive-950/10 px-2 py-0.5 text-xs font-semibold text-olive-700 dark:bg-white/10 dark:text-olive-300">
                      Imported from Stripe
                    </span>
                    <p className="text-sm text-olive-600 dark:text-olive-500">
                      Amount and schedule come from the existing Stripe subscription. Replacing with the 40% model cancels
                      this subscription and returns the tenant to standard rent setup.
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
              </>
            ) : !t.employment.verified && !t.paystub ? (
              <p className="text-sm text-olive-600 dark:text-olive-500">
                Waiting on income verification — the tenant must connect their bank via Plaid or upload a paystub before
                you can set up rent collection.
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
                    ? `(Plaid${t.employment.verifiedMonthlyIncome ? ` · ${formatCurrency(t.employment.verifiedMonthlyIncome)}/mo verified` : ''})`
                    : '(paystub uploaded — review it above)'}
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
      </Container>
    </section>
  )
}
