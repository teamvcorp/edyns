import 'server-only'

import { getMonthlyIncome, getPayrollIncome } from './plaid'

const WEEKS_PER_MONTH = 52 / 12
// A paycheck/deposit older than this (or none) means we couldn't confirm current income.
const RECENT_INCOME_WINDOW_MS = 45 * 24 * 60 * 60 * 1000

/** Self-employed implied weekly hours = monthly income ÷ (hourly rate × weeks/month). */
export function impliedWeeklyHours(monthlyIncome: number | null, hourlyRate: number | null | undefined): number | null {
  if (!monthlyIncome || !hourlyRate || hourlyRate <= 0) return null
  return Math.round((monthlyIncome / (hourlyRate * WEEKS_PER_MONTH)) * 10) / 10
}

export interface IncomeReading {
  monthlyIncome: number | null
  weeklyHours: number | null
  lastPayDate: string | null
  /** False when no recent income/paycheck was found (possible job loss). */
  hasRecentIncome: boolean
}

/**
 * Read a tenant's income from Plaid using the right method for their employment
 * type: Payroll (gross + actual hours + pay date) for employees, Bank deposits
 * for the self-employed (with hours implied from their claimed hourly rate).
 */
export async function readIncome(opts: {
  userToken: string
  selfEmployed: boolean
  claimedHourlyRate?: number
}): Promise<IncomeReading> {
  if (opts.selfEmployed) {
    // Self-employed: bank deposits are the income; hours are implied from the claimed rate.
    const monthlyIncome = await getMonthlyIncome(opts.userToken)
    return {
      monthlyIncome,
      weeklyHours: impliedWeeklyHours(monthlyIncome, opts.claimedHourlyRate),
      lastPayDate: null,
      hasRecentIncome: monthlyIncome != null && monthlyIncome > 0,
    }
  }

  const payroll = await getPayrollIncome(opts.userToken)
  const recentByDate =
    payroll.lastPayDate != null && Date.now() - new Date(payroll.lastPayDate).getTime() < RECENT_INCOME_WINDOW_MS
  // If we have income but no date (some providers omit it), treat as present.
  const hasRecentIncome = recentByDate || (payroll.lastPayDate == null && (payroll.monthlyIncome ?? 0) > 0)
  return {
    monthlyIncome: payroll.monthlyIncome,
    weeklyHours: payroll.weeklyHours,
    lastPayDate: payroll.lastPayDate,
    hasRecentIncome,
  }
}
