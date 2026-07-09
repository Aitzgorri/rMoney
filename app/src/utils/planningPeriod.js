import { getPlanningStartDay } from '../data/settings'

// Returns { start: Date, end: Date, label: string } for the current planning period.
// start and end are inclusive calendar dates (time set to midnight local).
//
// Logic:
//   startDay = 1  → standard calendar month (1st to last day)
//   startDay = 15 → period runs 15th this month to 14th next month
//   If today < startDay, the period started last month on startDay.
//   If today >= startDay, the period started this month on startDay.
export function getCurrentPeriod(today = new Date()) {
  const startDay = getPlanningStartDay()
  const year  = today.getFullYear()
  const month = today.getMonth()
  const day   = today.getDate()

  let start, end

  if (day >= startDay) {
    // Period started this month
    start = new Date(year, month, startDay)
    end   = new Date(year, month + 1, startDay - 1)
  } else {
    // Period started last month
    start = new Date(year, month - 1, startDay)
    end   = new Date(year, month, startDay - 1)
  }

  return { start, end, label: formatRange(start, end) }
}

// Returns the number of days remaining in the current period (including today).
export function daysRemaining(today = new Date()) {
  const { end } = getCurrentPeriod(today)
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const endMidnight   = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const diff = Math.floor((endMidnight - todayMidnight) / (1000 * 60 * 60 * 24)) + 1
  return Math.max(diff, 0)
}

// Returns true if a given date string (YYYY-MM-DD) falls within the current period.
export function isInCurrentPeriod(dateStr, today = new Date()) {
  const { start, end } = getCurrentPeriod(today)
  const d = new Date(dateStr + 'T00:00:00')
  return d >= start && d <= end
}

// The period immediately before the current one (Phase 55f).
export function getPreviousPeriod(today = new Date()) {
  const { start } = getCurrentPeriod(today)
  const dayBefore = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1)
  return getCurrentPeriod(dayBefore)
}

// Returns true if a date string falls within an explicit { start, end } period.
export function isInPeriod(dateStr, period) {
  const d = new Date(dateStr + 'T00:00:00')
  return d >= period.start && d <= period.end
}

// The transactions attributed to the CURRENT planning period (Phase 55f).
// Attribution is by date, except that a transaction carrying
// `periodShift: 'next'` (income received late in a period but meant to fund
// the following one — e.g. a wage on the 7th when the period starts on the
// 10th) counts in the period AFTER the one its date falls in:
//   • in-period transactions without the shift count here;
//   • previous-period transactions WITH the shift count here instead.
// Transfers are excluded, as before.
export function selectPeriodTransactions(transactions, today = new Date()) {
  const prev = getPreviousPeriod(today)
  return transactions.filter(t =>
    t.type !== 'transfer' && (
      (isInCurrentPeriod(t.date, today) && t.periodShift !== 'next') ||
      (isInPeriod(t.date, prev) && t.periodShift === 'next')
    )
  )
}

function formatRange(start, end) {
  const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${fmt(start)} — ${fmt(end)}`
}
