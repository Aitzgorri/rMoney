import { getInvestingAccounts } from '../data/investingAccounts'
import { getPositions } from '../data/stockTransactions'
import { getStockProfile } from '../data/stockProfiles'
import { getAllPortfolioAssignments, getPortfolios } from '../data/portfolios'
import { getHistoricalSeries } from '../data/marketDataClient'
import { convertToMain } from './currency'
import { getMainCurrency } from '../data/settings'

const PERIOD_RESOLUTION = {
  '1M': 'daily', '3M': 'daily', '6M': 'daily', '1Y': 'daily', '5Y': 'weekly', 'All': 'monthly',
}

// Returns the set of IDs for portfolioId and all its descendants
function portfolioDescendantIds(rootId) {
  const portfolios = getPortfolios()
  const result = new Set()
  function collect(id) {
    result.add(id)
    for (const p of portfolios) {
      if (p.parentId === id) collect(p.id)
    }
  }
  collect(rootId)
  return result
}

// scope: 'all' | 'portfolio' | 'stock'
// scopeParam: portfolioId (portfolio scope) | ticker (stock scope) | null (all scope)
// Returns [{date, value}] indexed to 100 at the first data point, or null if unavailable.
export async function computeMySeries(scope, scopeParam, period) {
  const resolution = PERIOD_RESOLUTION[period] ?? 'daily'
  const mainCurrency = getMainCurrency()

  // ── Per-stock: price series indexed to 100 (shares cancel in ratio) ──────────
  if (scope === 'stock') {
    if (!scopeParam) return null
    const profile = getStockProfile(scopeParam)
    try {
      const series = await getHistoricalSeries(
        scopeParam, profile?.stockExchange ?? null, period, resolution,
      )
      if (!series || series.length < 2) return null
      return indexSeries(series.map(p => ({ date: p.date, value: p.close })))
    } catch {
      return null
    }
  }

  // ── Portfolio or whole-portfolio: weighted daily value ────────────────────────
  const accounts = getInvestingAccounts()
  let allPositions = accounts.flatMap(acc => getPositions(acc.id))

  if (scope === 'portfolio') {
    if (!scopeParam) return null
    const validIds = portfolioDescendantIds(scopeParam)
    const assignments = getAllPortfolioAssignments()
    const validTickers = new Set(
      assignments.filter(a => validIds.has(a.portfolioId)).map(a => a.ticker),
    )
    allPositions = allPositions.filter(p => validTickers.has(p.ticker))
  }

  if (allPositions.length === 0) return null

  // Aggregate shares by ticker (sum across accounts; same currency assumed per ticker)
  const byTicker = new Map()
  for (const pos of allPositions) {
    const cur = byTicker.get(pos.ticker)
    if (cur) cur.shares += pos.shares
    else byTicker.set(pos.ticker, { shares: pos.shares, currency: pos.currency })
  }

  // Fetch historical series for each ticker in parallel
  const priceMaps = new Map()  // ticker → Map(date → close)
  await Promise.all([...byTicker.keys()].map(async ticker => {
    try {
      const profile = getStockProfile(ticker)
      const series = await getHistoricalSeries(
        ticker, profile?.stockExchange ?? null, period, resolution,
      )
      if (series?.length) priceMaps.set(ticker, new Map(series.map(p => [p.date, p.close])))
    } catch { /* skip unavailable */ }
  }))

  if (priceMaps.size === 0) return null

  // Union of all dates across all series, sorted
  const allDates = [
    ...new Set([...priceMaps.values()].flatMap(m => [...m.keys()])),
  ].sort()
  if (allDates.length < 2) return null

  // Trim to the date when ALL tickers have their first price — this prevents the
  // first indexed point from only reflecting a partial set of positions, which would
  // make later fully-covered dates appear as enormous returns (the "vertical line" bug).
  const effectiveStart = [...priceMaps.values()]
    .map(m => [...m.keys()].sort()[0])
    .reduce((max, d) => (d > max ? d : max))
  const activeDates = allDates.filter(d => d >= effectiveStart)
  if (activeDates.length < 2) return null

  // Build forward-filled price maps so intra-period gaps don't drop entire days
  const ffPrices = new Map()
  for (const [ticker, priceMap] of priceMaps) {
    const ff = new Map()
    let last = null
    for (const d of activeDates) {
      const v = priceMap.get(d)
      if (v != null) last = v
      if (last != null) ff.set(d, last)
    }
    ffPrices.set(ticker, ff)
  }

  // Compute daily portfolio value, skipping tickers/days where FX is unavailable
  const combined = []
  for (const date of activeDates) {
    let total = 0
    let hasAny = false
    for (const [ticker, pos] of byTicker) {
      const ff = ffPrices.get(ticker)
      if (!ff) continue
      const price = ff.get(date)
      if (price == null) continue
      const raw = pos.shares * price
      let converted = raw
      if (pos.currency !== mainCurrency) {
        converted = convertToMain(raw, pos.currency, mainCurrency)
        if (converted == null) continue  // FX cache unavailable for this pair
      }
      total += converted
      hasAny = true
    }
    if (hasAny && total > 0) combined.push({ date, value: total })
  }

  return indexSeries(combined)
}

// Returns null if series has < 2 points
function indexSeries(pts) {
  if (!pts || pts.length < 2) return null
  const start = pts[0].value
  if (!start) return null
  return pts.map(p => ({ date: p.date, value: (100 * p.value) / start }))
}

// Computes stats for an already-indexed series (values start near 100).
// Returns { totalReturn, paReturn, volatility } — all in %.
export function computeStats(series) {
  if (!series || series.length < 2) return null
  const values = series.map(p => p.value)
  const totalReturn = values[values.length - 1] - 100

  const days = Math.max(1,
    (new Date(series[series.length - 1].date) - new Date(series[0].date)) / 86_400_000,
  )
  const paReturn = (Math.pow(1 + totalReturn / 100, 365 / days) - 1) * 100

  const logReturns = []
  for (let i = 1; i < values.length; i++) {
    if (values[i] > 0 && values[i - 1] > 0) {
      logReturns.push(Math.log(values[i] / values[i - 1]))
    }
  }

  let volatility = 0
  if (logReturns.length > 1) {
    const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length
    const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (logReturns.length - 1)
    volatility = Math.sqrt(variance * 252) * 100
  }

  return { totalReturn, paReturn, volatility }
}
