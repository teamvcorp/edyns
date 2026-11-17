import 'server-only'

import { Binary, ObjectId, type Collection } from 'mongodb'
import { getDb } from './mongodb'
import { encryptBuffer, decryptBuffer, encryptString, decryptString } from './crypto'
import { sniffFileType } from './files'
import { getTenantById, setStatementsState } from './tenants'
import { listStatements, downloadStatement, plaidErrorCode } from './plaid'
import { logError, logWarn } from './log'

/**
 * Bank statements (Plaid Statements) — income-review fallback for tenants whose
 * payroll can't be found (plan: docs/plans/paycheck-collection.md, Phase 7;
 * vendor notes: docs/vendor/plaid-statements.md).
 *
 * Security model (same as paystubs/leases — statements are sensitive financial PII):
 *  - PDF bytes verified by magic number (%PDF-) before storing;
 *  - encrypted at rest (AES-256-GCM, EE_ENCRYPTION_KEY); no public URL;
 *  - admin-only no-store viewer route app/admin/tenants/[id]/statements/[statementId];
 *  - the AI analysis (lib/statement-reader.ts) is stored encrypted too;
 *  - auto-deleted after STATEMENT_RETENTION_DAYS (purgeOldStatements, daily cron).
 */

/** Statements to fetch for one review (Plaid bills by statements requested). */
export const STATEMENTS_TO_FETCH = 3
export const STATEMENT_RETENTION_DAYS = 180
const MAX_STATEMENT_BYTES = 15 * 1024 * 1024

interface StatementDoc {
  _id: ObjectId
  tenantId: ObjectId
  plaidStatementId: string
  accountId: string
  accountMask?: string
  year: number
  month: number
  data: Binary
  size: number
  fetchedAt: Date
  /** Encrypted JSON of the AI-extracted deposit lines (lib/statement-reader.ts). */
  analysisEnc?: string
  analyzedAt?: Date
}

export type StatementMeta = {
  id: string
  plaidStatementId: string
  accountMask?: string
  year: number
  month: number
  size: number
  fetchedAt: Date
  analyzedAt?: Date
}

let indexReady: Promise<unknown> | undefined

async function statementsCollection(): Promise<Collection<StatementDoc>> {
  const db = await getDb()
  const col = db.collection<StatementDoc>('bankStatements')
  indexReady ??= Promise.all([
    col.createIndex({ plaidStatementId: 1 }, { unique: true }),
    col.createIndex({ tenantId: 1, year: -1, month: -1 }),
  ]).catch((err) => {
    indexReady = undefined
    throw err
  })
  await indexReady
  return col
}

function toMeta(d: StatementDoc): StatementMeta {
  return {
    id: d._id.toString(),
    plaidStatementId: d.plaidStatementId,
    accountMask: d.accountMask,
    year: d.year,
    month: d.month,
    size: d.size,
    fetchedAt: d.fetchedAt,
    analyzedAt: d.analyzedAt,
  }
}

export async function listStatementsForTenant(tenantId: string): Promise<StatementMeta[]> {
  if (!ObjectId.isValid(tenantId)) return []
  const col = await statementsCollection()
  const docs = await col
    .find({ tenantId: new ObjectId(tenantId) }, { projection: { data: 0, analysisEnc: 0 } })
    .sort({ year: -1, month: -1 })
    .toArray()
  return docs.map(toMeta)
}

/** Decrypt one statement for the admin viewer (scoped to the tenant so ids can't be swapped). */
export async function readStatementFile(tenantId: string, statementId: string): Promise<Buffer | null> {
  if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(statementId)) return null
  const col = await statementsCollection()
  const doc = await col.findOne({ _id: new ObjectId(statementId), tenantId: new ObjectId(tenantId) })
  return doc ? decryptBuffer(Buffer.from(doc.data.buffer)) : null
}

/** All of a tenant's statement PDFs (decrypted) for the AI reader. */
export async function readStatementsForAnalysis(tenantId: string): Promise<{ id: string; year: number; month: number; bytes: Buffer }[]> {
  if (!ObjectId.isValid(tenantId)) return []
  const col = await statementsCollection()
  const docs = await col.find({ tenantId: new ObjectId(tenantId) }).sort({ year: 1, month: 1 }).toArray()
  return docs.map((d) => ({ id: d._id.toString(), year: d.year, month: d.month, bytes: decryptBuffer(Buffer.from(d.data.buffer)) }))
}

export async function saveStatementAnalysis(statementId: string, analysis: unknown): Promise<void> {
  if (!ObjectId.isValid(statementId)) return
  const col = await statementsCollection()
  await col.updateOne(
    { _id: new ObjectId(statementId) },
    { $set: { analysisEnc: encryptString(JSON.stringify(analysis)), analyzedAt: new Date() } },
  )
}

export async function readStatementAnalysis(statementId: string): Promise<unknown | null> {
  if (!ObjectId.isValid(statementId)) return null
  const col = await statementsCollection()
  const doc = await col.findOne({ _id: new ObjectId(statementId) }, { projection: { analysisEnc: 1 } })
  return doc?.analysisEnc ? JSON.parse(decryptString(doc.analysisEnc)) : null
}

/**
 * List the tenant's statements at Plaid and store the latest few for the linked
 * account. Returns the resulting state; also saved on the tenant's bank link so
 * the UI can ask for consent / fall back to a paystub.
 */
export async function fetchStatementsForTenant(
  tenantId: string,
): Promise<'fetched' | 'needs_consent' | 'unsupported' | 'error' | 'no_link'> {
  const tenant = await getTenantById(tenantId)
  const link = tenant?.bankLink
  if (!tenant || !link) return 'no_link'
  const accessToken = decryptString(link.accessTokenEnc)

  let list: Awaited<ReturnType<typeof listStatements>>
  try {
    list = await listStatements(accessToken)
  } catch (err) {
    const code = plaidErrorCode(err)
    // Before the tenant has approved statements, any product/consent error just
    // means "ask them" — Statements isn't on the Item yet. After consent, the
    // same codes mean the bank genuinely doesn't support it (→ paystub fallback).
    const consented = Boolean(link.statements?.consentedAt)
    const productIssue =
      code === 'PRODUCTS_NOT_SUPPORTED' ||
      code === 'INSTITUTION_NOT_SUPPORTED' ||
      code === 'ADDITIONAL_CONSENT_REQUIRED' ||
      code === 'INVALID_PRODUCT' ||
      code === 'PRODUCT_NOT_ENABLED' ||
      code === 'PRODUCT_NOT_READY'
    const state = !productIssue
      ? 'error'
      : !consented
        ? 'needs_consent'
        : code === 'PRODUCT_NOT_READY'
          ? 'needs_consent'
          : 'unsupported'
    if (state === 'error') logError('statements/list', err, { tenantId })
    else logWarn('statements/list', `statements ${state}`, { tenantId, code })
    await setStatementsState(tenantId, { ...link.statements, requestedAt: link.statements?.requestedAt ?? new Date(), status: state })
    return state
  }

  const account = list.accounts.find((a) => a.account_id === link.accountId) ?? list.accounts[0]
  const latest = [...(account?.statements ?? [])]
    .sort((a, b) => b.year - a.year || b.month - a.month)
    .slice(0, STATEMENTS_TO_FETCH)

  const col = await statementsCollection()
  for (const st of latest) {
    if (await col.findOne({ plaidStatementId: st.statement_id }, { projection: { _id: 1 } })) continue
    try {
      const bytes = await downloadStatement(accessToken, st.statement_id)
      if (bytes.length === 0 || bytes.length > MAX_STATEMENT_BYTES || sniffFileType(bytes) !== 'application/pdf') {
        logWarn('statements/download', 'rejected non-PDF or oversized statement', { tenantId })
        continue
      }
      await col.insertOne({
        _id: new ObjectId(),
        tenantId: new ObjectId(tenantId),
        plaidStatementId: st.statement_id,
        accountId: account!.account_id,
        accountMask: account!.account_mask,
        year: st.year,
        month: st.month,
        data: new Binary(encryptBuffer(bytes)),
        size: bytes.length,
        fetchedAt: new Date(),
      })
    } catch (err) {
      logError('statements/download', err, { tenantId })
    }
  }
  await setStatementsState(tenantId, { ...link.statements, requestedAt: link.statements?.requestedAt ?? new Date(), status: 'fetched', fetchedAt: new Date() })
  return 'fetched'
}

/** Retention: delete statements older than STATEMENT_RETENTION_DAYS (run by the daily cron). */
export async function purgeOldStatements(): Promise<number> {
  const col = await statementsCollection()
  const cutoff = new Date(Date.now() - STATEMENT_RETENTION_DAYS * 86_400_000)
  const res = await col.deleteMany({ fetchedAt: { $lt: cutoff } })
  return res.deletedCount
}
