// Newton-Raphson XIRR — finds the annualised internal rate of return for a set
// of irregular cash flows. Standard definition: the discount rate r such that
//   Σ  cf_i / (1 + r) ^ ((d_i − d_0) / 365.25)  =  0
//
// cashFlows: [{ date: 'YYYY-MM-DD', amount: number }]
//   Positive amounts = inflows (dividends received, proceeds of a sale, terminal MV).
//   Negative amounts = outflows (purchase cost including fees).
// Returns the annualised rate as a decimal (0.12 = 12 %) or null when the
// algorithm cannot converge (no-dividend stock held < 1 day, divergent series, …).

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000

export function computeXirr(cashFlows) {
  if (!cashFlows || cashFlows.length < 2) return null

  const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date))
  const d0ms = new Date(sorted[0].date).getTime()
  const years = sorted.map(cf => (new Date(cf.date).getTime() - d0ms) / MS_PER_YEAR)
  const amounts = sorted.map(cf => cf.amount)

  // Need at least one positive and one negative cash flow to have a solution.
  if (!amounts.some(a => a > 0) || !amounts.some(a => a < 0)) return null

  function npv(r) {
    return amounts.reduce((sum, a, i) => sum + a / Math.pow(1 + r, years[i]), 0)
  }

  function dnpv(r) {
    return amounts.reduce((sum, a, i) => {
      if (years[i] === 0) return sum
      return sum - years[i] * a / Math.pow(1 + r, years[i] + 1)
    }, 0)
  }

  function tryGuess(r0) {
    let r = r0
    for (let i = 0; i < 200; i++) {
      const f = npv(r)
      const df = dnpv(r)
      if (!isFinite(f) || !isFinite(df) || Math.abs(df) < 1e-14) break
      const delta = f / df
      const rNext = r - delta
      // Clamp to avoid stepping below −1 (undefined in the formula).
      r = rNext <= -0.9999 ? -0.5 : rNext
      if (Math.abs(delta) < 1e-8) return r
    }
    return null
  }

  // Try several starting points; keep the result whose |NPV| is smallest.
  let best = null
  let bestNpv = Infinity
  for (const guess of [0.1, 0.5, -0.5, 2.0]) {
    const result = tryGuess(guess)
    if (result != null && result > -0.9999 && isFinite(result)) {
      const residual = Math.abs(npv(result))
      if (residual < bestNpv) { bestNpv = residual; best = result }
    }
  }
  return best
}
