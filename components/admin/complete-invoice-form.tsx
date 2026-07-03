'use client'

import { useState } from 'react'
import { Button } from '@/components/elements/button'
import { ImageUploader } from '@/components/partners/image-uploader'
import { markCompletedAction } from '@/app/actions/invoices'

/**
 * Mark a project completed with a finished-work photo as evidence. Submitting
 * also emails the recipient any remaining balance to pay.
 */
export function CompleteInvoiceForm({ invoiceId }: { invoiceId: string }) {
  const [photo, setPhoto] = useState<string[]>([])

  return (
    <form action={markCompletedAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={invoiceId} />
      <input type="hidden" name="finishedPhotoUrl" value={photo[0] ?? ''} />
      <ImageUploader label="Finished-work photo (evidence)" value={photo} onChange={setPhoto} pathPrefix="invoices" />
      <Button type="submit" disabled={photo.length === 0} className="w-fit disabled:opacity-60">
        Mark completed & request balance
      </Button>
    </form>
  )
}
