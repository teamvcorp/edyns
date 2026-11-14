'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/dal'
import { getTenantById } from '@/lib/tenants'
import { PROGRAMS, programOf } from '@/lib/programs'
import {
  recordLedgerEntry,
  balancesFor,
  PAYOUT_METHODS,
  LEDGER_BUCKETS,
  type PayoutMethod,
  type LedgerBucket,
} from '@/lib/program-ledger'
import { formatCents } from '@/lib/format'
import { logError } from '@/lib/log'

/**
 * Admin bookkeeping for money edynsgate holds on behalf of program tenants
 * (lib/program-ledger.ts):
 *  - recordLandlordPaymentAction: staff paid the tenant's outside landlord
 *    (bill pay / ACH / check, OUTSIDE the app) → record it so the rent bucket
 *    goes down and the tenant sees it.
 *  - recordLedgerAdjustmentAction: a signed correction to either bucket with a
 *    required reason (e.g. refunding a rent surplus, fixing a typo).
 *
 * Every form carries a one-time `nonce` (randomUUID from the server render)
 * used as the ledger `ref`, so a double-submit records nothing twice.
 */

export type FundsFormState = { error?: string; ok?: string } | undefined

const MAX_DOLLARS = 100_000
const MAX_TEXT = 300

function readNonce(fd: FormData): string | null {
  const nonce = String(fd.get('nonce') ?? '')
  return /^[0-9a-f-]{36}$/i.test(nonce) ? nonce : null
}

/** yyyy-mm-dd → Date at local noon, or null. Must not be in the future. */
function readPastDate(value: FormDataEntryValue | null): Date | null {
  const s = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T12:00:00`)
  if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null
  return d
}

function readCents(value: FormDataEntryValue | null, { allowNegative = false } = {}): number | null {
  const n = Number(String(value ?? '').trim())
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) > MAX_DOLLARS) return null
  if (!allowNegative && n < 0) return null
  return Math.round(n * 100)
}

function revalidateFunds(tenantId: string) {
  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath('/admin/landlord-payments')
  revalidatePath('/tenants')
}

export async function recordLandlordPaymentAction(_prev: FundsFormState, fd: FormData): Promise<FundsFormState> {
  await requireRole('admin', '/admin/login')

  const tenantId = String(fd.get('tenantId') ?? '')
  const nonce = readNonce(fd)
  const amountCents = readCents(fd.get('amount'))
  const paidOn = readPastDate(fd.get('paidOn'))
  const method = String(fd.get('method') ?? '') as PayoutMethod
  const reference = String(fd.get('reference') ?? '').trim().slice(0, MAX_TEXT)
  const note = String(fd.get('note') ?? '').trim().slice(0, MAX_TEXT)

  if (!nonce) return { error: 'This form expired — reload the page and try again.' }
  if (amountCents === null) return { error: 'Enter the amount paid to the landlord.' }
  if (!paidOn) return { error: 'Enter the date the payment was sent (not in the future).' }
  if (!PAYOUT_METHODS.includes(method)) return { error: 'Choose how the landlord was paid.' }

  const tenant = await getTenantById(tenantId)
  if (!tenant) return { error: 'Tenant not found.' }
  if (!PROGRAMS[programOf(tenant)].outsideLandlord) return { error: 'This tenant’s program has no outside landlord.' }

  // Only pay out what we've collected: the nonprofit never fronts a tenant's rent.
  // Shortfalls are collected from the tenant first (monthly shortfall email).
  const { rentHeldCents } = await balancesFor(tenantId)
  if (amountCents > rentHeldCents) {
    return {
      error: `Only ${formatCents(rentHeldCents)} of this tenant’s rent is on hand. Collect the shortfall first, or record a smaller payment.`,
    }
  }

  try {
    const result = await recordLedgerEntry({
      tenantId,
      bucket: 'rent',
      kind: 'landlord_payment',
      amountCents: -amountCents,
      ref: `landlord:${nonce}`,
      at: paidOn,
      source: 'admin',
      method,
      reference: reference || undefined,
      note: note || undefined,
    })
    if (result === 'duplicate') return { ok: 'Already recorded.' }
  } catch (err) {
    logError('program-funds/landlord-payment', err, { tenantId })
    return { error: 'Could not record the payment. Please try again.' }
  }

  revalidateFunds(tenantId)
  return { ok: `Recorded ${formatCents(amountCents)} paid to ${tenant.landlord?.name ?? 'the landlord'}.` }
}

export async function recordLedgerAdjustmentAction(_prev: FundsFormState, fd: FormData): Promise<FundsFormState> {
  await requireRole('admin', '/admin/login')

  const tenantId = String(fd.get('tenantId') ?? '')
  const nonce = readNonce(fd)
  const bucket = String(fd.get('bucket') ?? '') as LedgerBucket
  const amountCents = readCents(fd.get('amount'), { allowNegative: true })
  const note = String(fd.get('note') ?? '').trim().slice(0, MAX_TEXT)

  if (!nonce) return { error: 'This form expired — reload the page and try again.' }
  if (!LEDGER_BUCKETS.includes(bucket)) return { error: 'Choose rent or car savings.' }
  if (amountCents === null) return { error: 'Enter a non-zero amount (negative to reduce the balance).' }
  if (!note) return { error: 'Explain the adjustment — it’s kept in the tenant’s history.' }

  const tenant = await getTenantById(tenantId)
  if (!tenant) return { error: 'Tenant not found.' }
  const def = PROGRAMS[programOf(tenant)]
  if (bucket === 'rent' && !def.outsideLandlord) return { error: 'This tenant has no rent bucket.' }
  if (bucket === 'car' && def.carRate === 0) return { error: 'This tenant has no car savings.' }

  // A reduction can't take the bucket below zero.
  const balances = await balancesFor(tenantId)
  const current = bucket === 'rent' ? balances.rentHeldCents : balances.carSavingsCents
  if (current + amountCents < 0) return { error: `That would make the balance negative (now ${formatCents(current)}).` }

  try {
    const result = await recordLedgerEntry({
      tenantId,
      bucket,
      kind: 'adjustment',
      amountCents,
      ref: `adjust:${nonce}`,
      at: new Date(),
      source: 'admin',
      note,
    })
    if (result === 'duplicate') return { ok: 'Already recorded.' }
  } catch (err) {
    logError('program-funds/adjustment', err, { tenantId })
    return { error: 'Could not record the adjustment. Please try again.' }
  }

  revalidateFunds(tenantId)
  return { ok: `Adjusted ${bucket === 'rent' ? 'rent' : 'car savings'} by ${formatCents(amountCents)}.` }
}
