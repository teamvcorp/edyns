'use client'

import { useActionState, useState } from 'react'
import { Button, SoftButton } from '@/components/elements/button'
import {
  lookupStripeSubscriptionAction,
  importStripeSubscriptionAction,
  type StripeLookupState,
} from '@/app/actions/admin'

const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-sm text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 dark:bg-white/5 dark:text-white dark:ring-white/10'
const labelClass = 'text-sm font-medium text-olive-950 dark:text-white'

const frequencyLabel = { weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly' } as const

export type TenantOption = { id: string; name: string; email: string; household: number }
export type PropertyOption = { id: string; label: string }

export function StripeImportForm({
  tenants,
  properties,
}: {
  tenants: TenantOption[]
  properties: PropertyOption[]
}) {
  const [state, lookupAction, pending] = useActionState<StripeLookupState, FormData>(
    lookupStripeSubscriptionAction,
    undefined,
  )
  const [tenantId, setTenantId] = useState('')
  const [subscriptionId, setSubscriptionId] = useState('')

  const selected = tenants.find((t) => t.id === tenantId)
  const found = state && 'data' in state ? state : null
  // Only show the preview/confirm step for the subscription id currently entered.
  const previewValid = found !== null && found.subscriptionId === subscriptionId.trim()

  return (
    <div className="flex flex-col gap-6">
      {/* Phase 1 — pick the person and look up their existing subscription */}
      <form action={lookupAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Tenant (the person)</span>
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            required
            className={inputClass}
          >
            <option value="" disabled>
              Select tenant…
            </option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.email}
              </option>
            ))}
          </select>
        </label>

        {selected && (
          <div className="rounded-lg bg-olive-950/5 p-3 text-sm dark:bg-white/5">
            <p className="font-medium text-olive-950 dark:text-white">{selected.name}</p>
            <p className="text-olive-600 dark:text-olive-500">
              {selected.email} · household of {selected.household}
            </p>
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Stripe subscription id</span>
          <input
            name="subscriptionId"
            value={subscriptionId}
            onChange={(e) => setSubscriptionId(e.target.value)}
            placeholder="sub_…"
            required
            className={inputClass}
          />
        </label>

        {state && 'error' in state && (
          <span role="alert" className="text-xs text-red-600 dark:text-red-400">
            {state.error}
          </span>
        )}

        <SoftButton type="submit" disabled={pending || !subscriptionId.trim()} className="w-fit disabled:opacity-60">
          {pending ? 'Looking up…' : 'Look up subscription'}
        </SoftButton>
      </form>

      {/* Phase 2 — confirm the imported details and associate a property */}
      {previewValid && (
        <form
          action={importStripeSubscriptionAction}
          className="flex flex-col gap-4 border-t border-olive-950/10 pt-6 dark:border-white/10"
        >
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="subscriptionId" value={found.subscriptionId} />

          <div className="rounded-lg bg-olive-950/5 p-4 text-sm dark:bg-white/5">
            <h4 className="font-semibold text-olive-950 dark:text-white">From Stripe</h4>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-olive-600 dark:text-olive-500">Amount</dt>
              <dd className="text-olive-950 dark:text-white">
                ${(found.data.amountCents / 100).toFixed(2)} {frequencyLabel[found.data.frequency]}
              </dd>
              <dt className="text-olive-600 dark:text-olive-500">Status</dt>
              <dd className="text-olive-950 capitalize dark:text-white">{found.data.status}</dd>
              <dt className="text-olive-600 dark:text-olive-500">Next draft</dt>
              <dd className="text-olive-950 dark:text-white">
                {new Date(found.data.nextDraftAt).toLocaleDateString()}
              </dd>
              <dt className="text-olive-600 dark:text-olive-500">Stripe customer</dt>
              <dd className="text-olive-950 dark:text-white">
                {found.data.customerName ?? '—'}
                {found.data.customerEmail ? ` · ${found.data.customerEmail}` : ''}
              </dd>
            </dl>
          </div>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Associate with property</span>
            <select name="propertyId" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Select property…
              </option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {properties.length === 0 && (
              <span className="text-xs text-red-600 dark:text-red-400">
                No approved properties yet — approve a property before importing.
              </span>
            )}
          </label>

          <p className="text-xs text-olive-600 dark:text-olive-500">
            Importing records this subscription as the tenant’s rent, marks them approved, and sets their address to the
            selected property.
          </p>

          <Button type="submit" disabled={!tenantId || properties.length === 0} className="w-fit disabled:opacity-60">
            Confirm import
          </Button>
        </form>
      )}
    </div>
  )
}
