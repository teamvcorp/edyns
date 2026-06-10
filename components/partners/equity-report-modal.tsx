'use client'

import { useEffect, useState } from 'react'
import { PlainButton, SoftButton, Button } from '@/components/elements/button'
import { formatCurrency } from '@/lib/format'
import { emailEquityReportAction } from '@/app/actions/properties'
import type { RentEquityEntry } from '@/lib/equity'

type Range = 'ytd' | 'all'

export function EquityReportModal({
  propertyId,
  propertyLabel,
  entries,
}: {
  propertyId: string
  propertyLabel: string
  entries: RentEquityEntry[]
}) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<Range>('ytd')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const startOfYear = new Date(new Date().getFullYear(), 0, 1)
  const shown =
    range === 'ytd' ? entries.filter((e) => new Date(e.paidAt) >= startOfYear) : entries
  const totalCents = shown.reduce((sum, e) => sum + e.equityCents, 0)

  return (
    <>
      <PlainButton type="button" onClick={() => setOpen(true)} className="w-fit text-sm">
        View equity report
      </PlainButton>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Equity report for ${propertyLabel}`}
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-hidden rounded-2xl bg-olive-100 p-6 shadow-xl dark:bg-olive-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col">
                <h3 className="text-lg font-semibold text-olive-950 dark:text-white">Equity generated</h3>
                <p className="text-sm text-olive-600 dark:text-olive-500">{propertyLabel}</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="-mr-1 -mt-1 rounded-full p-1 text-olive-600 hover:bg-olive-950/10 dark:text-olive-400 dark:hover:bg-white/10"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <SoftButton
                type="button"
                onClick={() => setRange('ytd')}
                className={range === 'ytd' ? 'ring-2 ring-olive-950 dark:ring-white' : ''}
              >
                Year to date
              </SoftButton>
              <SoftButton
                type="button"
                onClick={() => setRange('all')}
                className={range === 'all' ? 'ring-2 ring-olive-950 dark:ring-white' : ''}
              >
                All time
              </SoftButton>
            </div>

            <div className="flex items-baseline justify-between rounded-lg bg-olive-950/5 px-4 py-3 dark:bg-white/5">
              <span className="text-sm text-olive-600 dark:text-olive-500">
                Total equity ({range === 'ytd' ? 'YTD' : 'all time'})
              </span>
              <span className="font-display text-2xl text-olive-950 dark:text-white">
                {formatCurrency(totalCents / 100)}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {shown.length === 0 ? (
                <p className="py-6 text-center text-sm text-olive-600 dark:text-olive-500">
                  No rent equity recorded {range === 'ytd' ? 'this year' : 'yet'}.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-olive-600 dark:text-olive-500">
                      <th className="py-2 font-medium">Date</th>
                      <th className="py-2 text-right font-medium">Rent</th>
                      <th className="py-2 text-right font-medium">Share</th>
                      <th className="py-2 text-right font-medium">Equity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-olive-950/10 dark:divide-white/10">
                    {shown.map((e) => (
                      <tr key={e.id} className="text-olive-950 dark:text-white">
                        <td className="py-2">{new Date(e.paidAt).toLocaleDateString()}</td>
                        <td className="py-2 text-right">{formatCurrency(e.rentCents / 100)}</td>
                        <td className="py-2 text-right">{e.sharePercent}%</td>
                        <td className="py-2 text-right">{formatCurrency(e.equityCents / 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <form action={emailEquityReportAction} className="flex justify-end">
              <input type="hidden" name="propertyId" value={propertyId} />
              <Button type="submit">Email to me</Button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
