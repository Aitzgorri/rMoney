// Dividend projection utilities — all computations are ephemeral (never stored).

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

// Detects payout cadence from historical dividends (sorted desc by payoutDate,
// as getDividendsByTicker returns them).
// Returns { months, label } or null when cadence can't be determined.
export function detectCadence(dividends) {
  if (dividends.length < 2) return null
  const dates = dividends.map(d => d.payoutDate).reverse() // oldest first
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
export function estimateAmount(dividends, rule, manualAmount) {
  if (!dividends.length) return null
  if (rule === 'manual') return manualAmount ?? null
  if (rule === 'year-ago') {
    const target = new Date()
    target.setFullYear(target.getFullYear() - 1)
    const closest = dividends.slice().sort(
      (a, b) => Math.abs(new Date(a.payoutDate) - target) - Math.abs(new Date(b.payoutDate) - target)
    )
    return closest[0]?.dividendPerShare ?? null
  }
  return dividends[0].dividendPerShare // 'last-paid' (default)
}

// Computes the next `count` projected dividend payouts.
// dividends: sorted desc by payoutDate (as returned by getDividendsByTicker).
// Returns array of { date, dividendPerShare, currency, state, cadenceLabel }.
// state is always 'estimation' for now (API declared support is future work).
export function computeProjections(dividends, { rule = 'last-paid', manualAmount = null, count = 4 } = {}) {
  if (dividends.length < 2) return []
  const cadence = detectCadence(dividends)
  if (!cadence) return []

  const perShare = estimateAmount(dividends, rule, manualAmount)
  const today    = new Date().toISOString().slice(0, 10)
  const currency = dividends[0].currency

  const projections = []
  let base  = dividends[0].payoutDate
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
