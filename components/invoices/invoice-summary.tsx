import type { Invoice } from '@/lib/invoices'

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`

/**
 * Presentational summary of an invoice's scope, timeline, line items, photos,
 * and total. Shared by the admin detail page and the public recipient page so
 * both show identical numbers and fair-billing language.
 */
export function InvoiceSummary({ invoice, showProposedPhotos = true }: { invoice: Invoice; showProposedPhotos?: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="whitespace-pre-wrap text-sm/6 text-olive-800 dark:text-olive-200">{invoice.description}</p>

      <p className="rounded-lg bg-olive-950/5 px-4 py-3 text-sm text-olive-950 dark:bg-white/5 dark:text-white">
        <strong>Timeline:</strong> {invoice.timeline}
      </p>

      {showProposedPhotos && invoice.proposedPhotoUrls.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {invoice.proposedPhotoUrls.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt="Proposed work"
              className="size-32 rounded-lg object-cover ring-1 ring-olive-950/10 dark:ring-white/10"
            />
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-olive-600 dark:text-olive-400">
              <th className="px-2 py-1.5">Item</th>
              <th className="px-2 py-1.5 text-right">Qty</th>
              <th className="px-2 py-1.5 text-right">Unit</th>
              <th className="px-2 py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((li, i) => (
              <tr key={i} className="border-t border-olive-950/10 dark:border-white/10">
                <td className="px-2 py-1.5 text-olive-950 dark:text-white">{li.label}</td>
                <td className="px-2 py-1.5 text-right text-olive-950 dark:text-white">{li.quantity}</td>
                <td className="px-2 py-1.5 text-right text-olive-950 dark:text-white">{usd(li.unitCents)}</td>
                <td className="px-2 py-1.5 text-right text-olive-950 dark:text-white">{usd(li.quantity * li.unitCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-olive-950 dark:border-olive-300">
              <td colSpan={3} className="px-2 py-2 text-right font-semibold text-olive-950 dark:text-white">
                Project total
              </td>
              <td className="px-2 py-2 text-right font-semibold text-olive-950 dark:text-white">
                {usd(invoice.subtotalCents)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="rounded-lg bg-olive-950/5 px-4 py-3 text-xs/6 text-olive-600 dark:bg-white/5 dark:text-olive-400">
        <strong>Billing terms.</strong> No work begins without payment, and no new project may start until any
        outstanding balance is paid. Non-skilled labor and included materials are billed at 90% of cost. A card/bank
        processing fee is added at checkout.
      </p>
    </div>
  )
}
