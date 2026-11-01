'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getCurrentSession, requireRole } from '@/lib/dal'
import { rateLimit } from '@/lib/ratelimit'
import { logError, logWarn } from '@/lib/log'
import { formatAddress } from '@/lib/format'
import { getTenantByUserId } from '@/lib/tenants'
import { findPartnerById } from '@/lib/users'
import { sendRepairAlert, sendRepairStatusEmail } from '@/lib/email'
import {
  repairablePropertiesFor,
  checkRepairPhotos,
  createRepairRequest,
  cancelOwnRepair,
  setRepairStatus,
  getRepairById,
  REPAIR_CATEGORIES,
  REPAIR_URGENCIES,
  REPAIR_STATUSES,
  CATEGORY_LABEL,
  STATUS_LABEL,
  MAX_TITLE,
  MAX_DESCRIPTION,
  MAX_ADMIN_NOTE,
  type RepairCategory,
  type RepairUrgency,
  type RepairStatus,
} from '@/lib/repairs'

export type RepairFormState = { error?: string; ok?: boolean } | undefined

// Spam / abuse cap per account. Real emergencies past this should be phoned in.
const REPAIR_LIMIT = 5
const REPAIR_WINDOW_MS = 24 * 60 * 60 * 1000

const portalFor = { partner: '/partners/repairs', tenant: '/tenants/repairs' } as const

/** Signed-in partner or tenant (validated by the DAL), else bounce. */
async function requireRequester() {
  const session = await getCurrentSession()
  if (!session || (session.role !== 'partner' && session.role !== 'tenant')) redirect('/')
  if (session.mustReset) redirect(session.role === 'tenant' ? '/tenants/set-password' : '/partners/set-password')
  return session as typeof session & { role: 'partner' | 'tenant' }
}

/**
 * Partner or tenant files a repair request for a property they're allowed to
 * (see repairablePropertiesFor). Photos are validated and stored encrypted.
 */
export async function submitRepairRequest(_prev: RepairFormState, formData: FormData): Promise<RepairFormState> {
  const session = await requireRequester()

  const propertyId = String(formData.get('propertyId') ?? '')
  const category = String(formData.get('category') ?? '') as RepairCategory
  const urgency = String(formData.get('urgency') ?? '') as RepairUrgency
  // Single line: the title also goes into an email subject.
  const title = String(formData.get('title') ?? '').replace(/[\r\n]+/g, ' ').trim()
  const description = String(formData.get('description') ?? '').trim()

  if (!REPAIR_CATEGORIES.includes(category)) return { error: 'Choose a category.' }
  if (!REPAIR_URGENCIES.includes(urgency)) return { error: 'Choose how urgent this is.' }
  if (!title || title.length > MAX_TITLE) return { error: `Enter a short summary (up to ${MAX_TITLE} characters).` }
  if (!description || description.length > MAX_DESCRIPTION) {
    return { error: `Describe the problem (up to ${MAX_DESCRIPTION} characters).` }
  }

  // Authorization: the property must be in the list WE derive for this user.
  const allowed = await repairablePropertiesFor(session)
  const property = allowed.find((p) => p.id === propertyId)
  if (!property) {
    logWarn('repairs', 'request for a property the user may not use', { userId: session.sub, propertyId })
    return { error: 'You can’t request repairs for that property.' }
  }

  const { allowed: underLimit } = await rateLimit({
    key: `repair:${session.sub}`,
    limit: REPAIR_LIMIT,
    windowMs: REPAIR_WINDOW_MS,
  })
  if (!underLimit) {
    return { error: 'You’ve sent several requests today. For an emergency, please call us directly.' }
  }

  const files = formData.getAll('photos').filter((f): f is File => f instanceof File)
  const photos = await checkRepairPhotos(files)
  if (!photos.ok) return { error: photos.error }

  let repairId: string
  try {
    const repair = await createRepairRequest({
      propertyId: property.id,
      requesterRole: session.role,
      requesterUserId: session.sub,
      category,
      urgency,
      title,
      description,
      photos: photos.photos,
    })
    repairId = repair.id
  } catch (err) {
    logError('repairs/create', err, { propertyId: property.id })
    return { error: 'Something went wrong saving your request. Please try again.' }
  }

  try {
    await sendRepairAlert({
      repairId,
      urgency,
      requesterRole: session.role,
      address: formatAddress(property.address),
      category: CATEGORY_LABEL[category],
      title,
      description,
    })
  } catch (err) {
    // The request is saved and visible in the admin queue; the email is a nudge.
    logError('repairs/alert-email', err, { repairId })
  }

  revalidatePath(portalFor[session.role])
  revalidatePath('/admin/repairs')
  return { ok: true }
}

/** Requester cancels their own request while it's still open. */
export async function cancelRepairRequest(formData: FormData): Promise<void> {
  const session = await requireRequester()
  const id = String(formData.get('id') ?? '')
  const ok = await cancelOwnRepair(id, session.sub)
  if (!ok) logWarn('repairs', 'cancel refused (not owner or no longer open)', { userId: session.sub, repairId: id })
  revalidatePath(portalFor[session.role])
  revalidatePath('/admin/repairs')
}

/** Admin moves a request through the queue, optionally with a note the requester sees. */
export async function updateRepairStatusAction(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/login')
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '') as RepairStatus
  const note = String(formData.get('note') ?? '').trim().slice(0, MAX_ADMIN_NOTE)

  const existing = await getRepairById(id)
  if (!existing) redirect('/admin/repairs')
  if (!REPAIR_STATUSES.includes(status)) redirect(`/admin/repairs/${id}?error=status`)

  const updated = await setRepairStatus(id, status, note || undefined)
  if (!updated) redirect(`/admin/repairs/${id}?error=status`)

  // Notify the requester (best-effort; the change is saved either way).
  let emailOk = true
  try {
    const who =
      updated.requesterRole === 'tenant'
        ? await getTenantByUserId(updated.requesterUserId!)
        : await findPartnerById(updated.requesterUserId!)
    if (who) {
      await sendRepairStatusEmail({
        to: who.email,
        name: who.name,
        portalPath: portalFor[updated.requesterRole],
        title: updated.title,
        statusLabel: STATUS_LABEL[status],
        note: note || undefined,
      })
    }
  } catch (err) {
    emailOk = false
    logError('repairs/status-email', err, { repairId: id })
  }

  revalidatePath('/admin/repairs')
  revalidatePath(`/admin/repairs/${id}`)
  redirect(`/admin/repairs/${id}?${emailOk ? 'updated=1' : 'email=failed'}`)
}
