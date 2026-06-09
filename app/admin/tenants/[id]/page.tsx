import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import { getTenantById } from '@/lib/tenants'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Link } from '@/components/elements/link'
import { TenantReviewActions } from '@/components/admin/tenant-review-actions'
import { TenantBillingForm } from '@/components/admin/tenant-billing-form'
import { formatAddress, formatCurrency } from '@/lib/format'

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
          <Eyebrow>Administration</Eyebrow>
          <Subheading className="text-3xl/9 sm:text-4xl/12">{t.name}</Subheading>
          <Link href="/admin/tenants">← Back to tenant applications</Link>
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
              label="Verified income"
              value={t.employment.verifiedMonthlyIncome ? formatCurrency(t.employment.verifiedMonthlyIncome) : '—'}
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
              <dl className="grid gap-4 sm:grid-cols-3">
                <Row label="Amount" value={`${formatCurrency(t.billing.amountCents / 100)} ${frequencyLabel[t.billing.frequency]}`} />
                <Row label="Base (40%)" value={formatCurrency(t.billing.baseAmountCents / 100)} />
                <Row label="Status" value={t.billing.status} />
                <Row label="First draft" value={new Date(t.billing.firstDraftAt).toLocaleDateString()} />
              </dl>
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
                <TenantBillingForm tenantId={t.id} />
              </>
            )}
          </Card>
        )}
      </Container>
    </section>
  )
}
