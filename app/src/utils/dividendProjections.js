// Dividend projection utilities — all computations are ephemeral (never stored).
//
// detectEffectiveDividendFrequency is also exported here for use by Phase 28b
// forward-yield calculation. It is a pure function — callers supply the data.

// Adds n months to a YYYY-MM-DD string, clamping the day to the last valid day.
function addMonths(dateStr, n) {
  const [yr, mo, dy] = dateStr.split('-').map(Number)
  let newMo = mo - 1 + n          // 0-indexed
  let newYr = yr + Math.floor(newMo / 12)
  newMo = ((newMo % 12) + 12) % 12
  const lastDay = new Date(newYr, newMo + 1, 0).getDate()
  const newDy   = Math.min(dy, lastDay)
  return `${newYr}-${String(newMo + 1).padStart(2, '0')}-${String(newDy).padStart(2, '0')}`
}

// Returns dividends with type === 'special' removed.
// Treats null/undefined type as 'regular' (legacy records pre-Phase 25d).
function regularOnly(dividends) {
  return dividends.filter(d => d.type == null || d.type === 'regular')
}

// Detects payout cadence from historical dividends (sorted desc by payoutDate,
// as getDividendsByTicker returns them). Special dividends are excluded —
// they are one-off and would skew the median gap.
// Returns { months, label } or null when cadence can't be determined.
export function detectCadence(dividends) {
  const regular = regularOnly(dividends)
  if (regular.length < 2) return null
  const dates = regular.map(d => d.payoutDate).reverse() // oldest first
  const gaps  = []
  for (let i = 1; i < dates.length; i++) {
    const ms = new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()
    gaps.push(ms / (1000 * 60 * 60 * 24))
  }
  const sorted = [...gaps].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  if (median <=  45) return { months:  1, label: 'Monthly' }
  if (median <= 120) return { months:  3, label: 'Quarterly' }
  if (median <= 270) return { months:  6, label: 'Semi-annual' }
  if (median <= 500) return { months: 12, label: 'Annual' }
  return null
}

// Estimates per-share amount based on the estimation rule.
// dividends: sorted desc (most recent first).
// Special dividends are excluded — projections must reflect the recurring stream.
export function estimateAmount(dividends, rule, manualAmount) {
  if (rule === 'manual') return manualAmount ?? null
  const regular = regularOnly(dividends)
  if (!regular.length) return null
  if (rule === 'year-ago') {
    const target = new Date()
    target.setFullYear(target.getFullYear() - 1)
    const closest = regular.slice().sort(
      (a, b) => Math.abs(new Date(a.payoutDate) - target) - Math.abs(new Date(b.payoutDate) - target)
    )
    return closest[0]?.dividendPerShare ?? null
  }
  return regular[0].dividendPerShare // 'last-paid' (default)
}

// Maps a cadence months-value to the canonical frequency string.
const CADENCE_TO_FREQ = { 1: 'monthly', 3: 'quarterly', 6: 'semi-annual', 12: 'annual' }

// Returns the effective dividend frequency for a stock.
// storedFrequency: value from stockProfile.dividendFrequency (or 'unknown').
// apiHistory: records from getApiDividendHistoryForTicker(ticker) — shape { exDate, payDate, type }.
// userDividends: records from getDividendsByTicker(ticker) — shape { payoutDate, type }.
// When storedFrequency is not 'unknown', it is returned directly.
// Otherwise cadence is derived from ≥ 2 regular payouts across both sources.
// Returns: 'monthly' | 'quarterly' | 'semi-annual' | 'annual' | 'unknown'
export function detectEffectiveDividendFrequency(storedFrequency, { apiHistory = [], userDividends = [] } = {}) {
  if (storedFrequency && storedFrequency !== 'unknown') return storedFrequency

  // Merge dates from both sources, treating null/undefined type as 'regular'.
  const dates = [
    ...apiHistory
      .filter(r => r.type == null || r.type === 'regular')
      .map(r => r.payDate ?? r.exDate)
      .filter(Boolean),
    ...userDividends
      .filter(d => d.type == null || d.type === 'regular')
      .map(d => d.payoutDate)
      .filter(Boolean),
  ]

  // Dedupe and sort oldest-first.
  const unique = [...new Set(dates)].sort()
  if (unique.length < 2) return 'unknown'

  const gaps = []
  for (let i = 1; i < unique.length; i++) {
    const ms = new Date(unique[i]).getTime() - new Date(unique[i - 1]).getTime()
    gaps.push(ms / (1000 * 60 * 60 * 24))
  }
  const sorted = [...gaps].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]

  if (median <=  45) return CADENCE_TO_FREQ[1]
  if (median <= 120) return CADENCE_TO_FREQ[3]
  if (median <= 270) return CADENCE_TO_FREQ[6]
  if (median <= 500) return CADENCE_TO_FREQ[12]
  return 'unknown'
}

// Computes the next `count` projected dividend payouts.
// dividends: sorted desc by payoutDate (as returned by getDividendsByTicker).
// Special dividends are excluded — they are one-off and would distort both
// cadence detection and the per-share amount estimate.
// Returns array of { date, dividendPerShare, currency, state, cadenceLabel }.
// state is always 'estimation' for now (API declared support is future work).
export function computeProjections(dividends, { rule = 'last-paid', manualAmount = null, count = 4 } = {}) {
  const regular = regularOnly(dividends)
  if (regular.length < 2) return []
  const cadence = detectCadence(regular)
  if (!cadence) return []

  const perShare = estimateAmount(regular, rule, manualAmount)
  const today    = new Date().toISOString().slice(0, 10)
  const currency = regular[0].currency

  const projections = []
  let base  = regular[0].payoutDate
  let steps = 0

  while (projections.length < count && steps < 48) {
    base = addMonths(base, cadence.months)
    steps++
    if (base > today) {
      projections.push({
        date: base,
        dividendPerShare: perShare,
        currency,
        state: 'estimation',
        cadenceLabel: cadence.label,
      })
    }
  }
  return projections
}
