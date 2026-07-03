'use client'

import { useActionState, useState } from 'react'
import { Button, SoftButton } from '@/components/elements/button'
import { ImageUploader } from '@/components/partners/image-uploader'
import type { InvoiceFormState } from '@/app/actions/invoices'
import type { Invoice } from '@/lib/invoices'

const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:placeholder:text-olive-400'

type PartnerOption = { id: string; name: string; email: string }
type Row = { label: string; quantity: string; unitDollars: string }

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`

function rowsToCents(rows: Row[]): number {
  return rows.reduce((sum, r) => {
    const qty = Math.max(0, Math.floor(Number(r.quantity) || 0))
    const cents = Math.max(0, Math.round((Number(r.unitDollars) || 0) * 100))
    return sum + qty * cents
  }, 0)
}

export function InvoiceForm({
  action,
  partners,
  invoice,
  mode,
}: {
  action: (prev: InvoiceFormState, formData: FormData) => Promise<InvoiceFormState>
  partners: PartnerOption[]
  invoice?: Invoice
  mode: 'create' | 'edit'
}) {
  const [state, formAction, pending] = useActionState(action, undefined)

  const [useExisting, setUseExisting] = useState(invoice ? Boolean(invoice.recipient.partnerId) : true)
  const [partnerId, setPartnerId] = useState(invoice?.recipient.partnerId ?? '')
  const [name, setName] = useState(invoice?.recipient.partnerId ? '' : invoice?.recipient.name ?? '')
  const [email, setEmail] = useState(invoice?.recipient.partnerId ? '' : invoice?.recipient.email ?? '')
  const [phone, setPhone] = useState(invoice?.recipient.phone ?? '')

  const [title, setTitle] = useState(invoice?.title ?? '')
  const [description, setDescription] = useState(invoice?.description ?? '')
  const [timeline, setTimeline] = useState(invoice?.timeline ?? '')

  const [rows, setRows] = useState<Row[]>(
    invoice && invoice.lineItems.length > 0
      ? invoice.lineItems.map((li) => ({
          label: li.label,
          quantity: String(li.quantity),
          unitDollars: (li.unitCents / 100).toFixed(2),
        }))
      : [{ label: '', quantity: '1', unitDollars: '' }],
  )
  const [photos, setPhotos] = useState<string[]>(invoice?.proposedPhotoUrls ?? [])

  const subtotalCents = rowsToCents(rows)
  const err = (k: string) => state?.errors?.[k]

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  // Serialized hidden payloads read by the server action.
  const lineItemsJson = JSON.stringify(
    rows.map((r) => ({ label: r.label.trim(), quantity: Number(r.quantity) || 0, unitDollars: Number(r.unitDollars) || 0 })),
  )

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {mode === 'edit' && invoice && <input type="hidden" name="id" value={invoice.id} />}
      <input type="hidden" name="partnerId" value={useExisting ? partnerId : ''} />
      <input type="hidden" name="lineItems" value={lineItemsJson} />
      <input type="hidden" name="proposedPhotoUrls" value={JSON.stringify(photos)} />

      {/* Recipient */}
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Recipient</legend>
        <div className="flex gap-4 text-sm text-olive-950 dark:text-white">
          <label className="flex items-center gap-2">
            <input type="radio" checked={useExisting} onChange={() => setUseExisting(true)} />
            Existing partner
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!useExisting} onChange={() => setUseExisting(false)} />
            New recipient
          </label>
        </div>

        {useExisting ? (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
            <span>Partner</span>
            <select className={inputClass} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">Select a partner…</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.email}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
              <span>Name</span>
              <input name="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
              {err('name') && <span className="text-xs font-normal text-red-600 dark:text-red-400">{err('name')}</span>}
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
                <span>Email</span>
                <input name="email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
                {err('email') && <span className="text-xs font-normal text-red-600 dark:text-red-400">{err('email')}</span>}
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
                <span>
                  Phone <span className="font-normal text-olive-500">(optional)</span>
                </span>
                <input name="phone" type="tel" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
            </div>
          </div>
        )}
      </fieldset>

      {/* Scope */}
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Scope of work</legend>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
          <span>Project title</span>
          <input name="title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          {err('title') && <span className="text-xs font-normal text-red-600 dark:text-red-400">{err('title')}</span>}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
          <span>Description of work</span>
          <textarea
            name="description"
            rows={4}
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {err('description') && (
            <span className="text-xs font-normal text-red-600 dark:text-red-400">{err('description')}</span>
          )}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-olive-950 dark:text-white">
          <span>Timeline</span>
          <input
            name="timeline"
            className={inputClass}
            placeholder="e.g. 2–3 weeks from deposit"
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
          />
          {err('timeline') && <span className="text-xs font-normal text-red-600 dark:text-red-400">{err('timeline')}</span>}
        </label>
      </fieldset>

      {/* Line items */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Line items</legend>
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-olive-600 dark:text-olive-400">
              Item
              <input
                className={inputClass}
                value={r.label}
                placeholder="e.g. Drywall repair (materials incl.)"
                onChange={(e) => setRow(i, { label: e.target.value })}
              />
            </label>
            <label className="flex w-20 flex-col gap-1 text-xs font-medium text-olive-600 dark:text-olive-400">
              Qty
              <input
                type="number"
                min="1"
                className={inputClass}
                value={r.quantity}
                onChange={(e) => setRow(i, { quantity: e.target.value })}
              />
            </label>
            <label className="flex w-28 flex-col gap-1 text-xs font-medium text-olive-600 dark:text-olive-400">
              Unit ($)
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                value={r.unitDollars}
                onChange={(e) => setRow(i, { unitDollars: e.target.value })}
              />
            </label>
            <SoftButton
              type="button"
              onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs))}
              className="text-red-600 dark:text-red-400"
            >
              Remove
            </SoftButton>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <SoftButton type="button" onClick={() => setRows((rs) => [...rs, { label: '', quantity: '1', unitDollars: '' }])}>
            Add line item
          </SoftButton>
          <span className="text-sm font-semibold text-olive-950 dark:text-white">Total: {usd(subtotalCents)}</span>
        </div>
        {err('lineItems') && <span className="text-xs font-normal text-red-600 dark:text-red-400">{err('lineItems')}</span>}
      </fieldset>

      {/* Photos */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-olive-700 dark:text-olive-400">Photos of proposed work</legend>
        <ImageUploader label="Add photos" multiple value={photos} onChange={setPhotos} pathPrefix="invoices" />
      </fieldset>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {mode === 'create' ? (
          <>
            <Button type="submit" name="intent" value="send" size="lg" disabled={pending} className="disabled:opacity-60">
              {pending ? 'Working…' : 'Save & send to recipient'}
            </Button>
            <SoftButton type="submit" name="intent" value="draft" size="lg" disabled={pending} className="disabled:opacity-60">
              Save as draft
            </SoftButton>
          </>
        ) : (
          <>
            <Button type="submit" name="intent" value="resubmit" size="lg" disabled={pending} className="disabled:opacity-60">
              {pending ? 'Working…' : 'Save & resend'}
            </Button>
            <SoftButton type="submit" name="intent" value="save" size="lg" disabled={pending} className="disabled:opacity-60">
              Save changes
            </SoftButton>
          </>
        )}
      </div>
    </form>
  )
}
