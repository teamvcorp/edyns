import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import { getRepairById, CATEGORY_LABEL, STATUS_LABEL, REPAIR_STATUSES, MAX_ADMIN_NOTE } from '@/lib/repairs'
import { getPropertyById } from '@/lib/properties'
import { getTenantByUserId } from '@/lib/tenants'
import { findPartnerById } from '@/lib/users'
import { updateRepairStatusAction } from '@/app/actions/repairs'
import { formatAddress } from '@/lib/format'
import { Container } from '@/components/elements/container'
import { Card } from '@/components/elements/card'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Subheading } from '@/components/elements/subheading'
import { Breadcrumbs } from '@/components/elements/breadcrumbs'
import { Link } from '@/components/elements/link'
import { Button } from '@/components/elements/button'
import { inputClass } from '@/components/elements/input'

export const metadata: Metadata = { title: 'Repair request' }

const banner: Record<string, { ok: boolean; text: string }> = {
  updated: { ok: true, text: 'Status updated — the requester was emailed.' },
  failed: { ok: false, text: 'Status updated, but the email to the requester failed to send.' },
  status: { ok: false, text: 'Choose a valid status.' },
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-olive-600 dark:text-olive-500">{label}</dt>
      <dd className="text-sm text-olive-950 dark:text-white">{value}</dd>
    </div>
  )
}

export default async function AdminRepairPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ updated?: string; email?: string; error?: string }>
}) {
  await requireRole('admin', '/admin/login')
  const { id } = await params
  const sp = await searchParams
  const repair = await getRepairById(id)
  if (!repair) notFound()

  const property = await getPropertyById(repair.propertyId)
  // Requester identity is admin-only (partners see tenant requests anonymised).
  let requester: { name: string; email: string; href: string } | null = null
  if (repair.requesterRole === 'tenant') {
    const t = await getTenantByUserId(repair.requesterUserId!)
    if (t) requester = { name: t.name, email: t.email, href: `/admin/tenants/${t.id}` }
  } else {
    const p = await findPartnerById(repair.requesterUserId!)
    if (p) requester = { name: p.name, email: p.email, href: `/admin/partners/${p.id}` }
  }
  const msg = sp.updated ? banner.updated : sp.email === 'failed' ? banner.failed : sp.error ? banner.status : undefined

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Breadcrumbs
            className="mb-2"
            items={[
              { label: 'Admin dashboard', href: '/admin' },
              { label: 'Repair requests', href: '/admin/repairs' },
              { label: repair.title },
            ]}
          />
          <Eyebrow>Repair request</Eyebrow>
          <Subheading className="text-3xl/9 sm:text-4xl/12">{repair.title}</Subheading>
        </div>

        {msg && (
          <p
            role="status"
            className={msg.ok ? 'text-sm text-olive-700 dark:text-olive-300' : 'text-sm text-red-600 dark:text-red-400'}
          >
            {msg.text}
          </p>
        )}

        <Card className="flex flex-col gap-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Row label="Status" value={STATUS_LABEL[repair.status]} />
            <Row
              label="Urgency"
              value={
                <span
                  className={
                    repair.urgency === 'emergency' ? 'font-semibold text-red-600 capitalize dark:text-red-400' : 'capitalize'
                  }
                >
                  {repair.urgency}
                </span>
              }
            />
            <Row label="Category" value={CATEGORY_LABEL[repair.category]} />
            <Row label="Submitted" value={repair.createdAt.toLocaleString()} />
            <Row
              label="Property"
              value={
                property ? <Link href={`/admin/properties/${property.id}`}>{formatAddress(property.address)}</Link> : '—'
              }
            />
            <Row
              label={repair.requesterRole === 'tenant' ? 'Tenant' : 'Owner (partner)'}
              value={
                requester ? (
                  <>
                    <Link href={requester.href}>{requester.name}</Link> · {requester.email}
                  </>
                ) : (
                  'Account no longer exists'
                )
              }
            />
          </dl>
          <p className="text-sm whitespace-pre-wrap text-olive-800 dark:text-olive-200">{repair.description}</p>
          {repair.photoCount > 0 && (
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: repair.photoCount }, (_, i) => (
                <a key={i} href={`/api/repairs/${repair.id}/photos/${i}`} target="_blank" rel="noopener noreferrer">
                  {/* Plain <img>: next/image would cache this private photo in the optimizer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/repairs/${repair.id}/photos/${i}`}
                    alt={`Repair photo ${i + 1}`}
                    className="size-32 rounded-lg object-cover ring-1 ring-olive-950/10 dark:ring-white/10"
                  />
                </a>
              ))}
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Update status</h3>
          <form action={updateRepairStatusAction} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={repair.id} />
            <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
              Status
              <select name="status" defaultValue={repair.status} className={inputClass}>
                {REPAIR_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
              Note to the requester (optional — they see it in their portal and by email)
              <textarea
                name="note"
                rows={3}
                maxLength={MAX_ADMIN_NOTE}
                defaultValue={repair.adminNote ?? ''}
                placeholder="e.g. Plumber booked for Tuesday 9–11am."
                className={inputClass}
              />
            </label>
            <Button type="submit" className="w-fit">
              Save &amp; notify
            </Button>
          </form>

          <div>
            <h4 className="text-sm font-semibold text-olive-950 dark:text-white">History</h4>
            <ul className="mt-1 text-sm text-olive-700 dark:text-olive-300">
              {repair.statusHistory.map((h, i) => (
                <li key={i}>
                  {h.at.toLocaleString()} — {STATUS_LABEL[h.status]}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </Container>
    </section>
  )
}
