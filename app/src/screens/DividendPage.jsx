import { useState, useMemo, useRef, useEffect } from 'react'
import appStorage from '../utils/appStorage'
import { getInvestingAccounts } from '../data/investingAccounts'
import { getPositions, getOpenLots } from '../data/stockTransactions'
import {
  getApiDividendHistoryForTicker, refreshApiDividendHistory, isStaleForTicker, getRefreshMeta,
} from '../data/apiDividendHistory'
import {
  getDividends, getDividend, getDividendsByTicker, resolveDividendTaxPercent,
  getPendingConfirmationDividends, confirmDividend, deleteDividend, updateDividend, computeDividendDerived,
} from '../data/dividends'
import { getStockProfile, getEffectiveHqCountry } from '../data/stockProfiles'
import { getAllPortfolioAssignments, getPortfolios } from '../data/portfolios'
import { getLatestPrice } from '../data/marketDataClient'
import { convertToMain, ensureRates } from '../utils/currency'
import { getMainCurrency } from '../data/settings'
import { countryDetailRegion, continentRegion } from '../utils/regionMap'
import { detectEffectiveDividendFrequency } from '../utils/dividendProjections'
import {
  getDividendChartPresets, createDividendChartPreset, updateDividendChartPreset, deleteDividendChartPreset,
} from '../data/dividendChartPresets'
import { fmtAmt, fmtPriceAmt, parseAmount } from '../utils/format'
import AmountInput from '../components/AmountInput'
import { resetPageCaches } from '../utils/marketDataCache'
import MultiAccountDividendForm from '../components/MultiAccountDividendForm'
import styles from './DividendPage.module.css'

// ─── Constants ────────────────────────────────────────────────────────────────

const FREQ_MULTIPLIER = { monthly: 12, quarterly: 4, 'semi-annual': 2, annual: 1 }

const CHART_COLORS = [
  '#4A9DEC', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6',
  '#06B6D4', '#F97316', '#EC4899', '#6366F1', '#14B8A6',
]

const METRICS_COLUMNS = [
  { id: 'ttmYield',    label: 'TTM yield',       numeric: true },
  { id: 'fwdYield',    label: 'Forward yield',    numeric: true },
  { id: 'last12m',     label: 'Last 12m amount',  numeric: true },
  { id: 'next12m',     label: 'Next 12m amount',  numeric: true },
  { id: 'cagr3',       label: 'CAGR 3y',          numeric: true },
  { id: 'cagr5',       label: 'CAGR 5y',          numeric: true },
  { id: 'cagr10',      label: 'CAGR 10y',         numeric: true },
]

const PERIOD_LABELS_QUARTER = ['Q1', 'Q2', 'Q3', 'Q4']
const PERIOD_LABELS_MONTH   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10) }

function shiftYear(dateStr, years) {
  const [yr, mo, dy] = dateStr.split('-')
  return `${+yr + years}-${mo}-${dy}`
}

function addMonths(dateStr, n) {
  const [yr, mo, dy] = dateStr.split('-').map(Number)
  let newMo = mo - 1 + n
  let newYr = yr + Math.floor(newMo / 12)
  newMo = ((newMo % 12) + 12) % 12
  const lastDay = new Date(newYr, newMo + 1, 0).getDate()
  const newDy   = Math.min(dy, lastDay)
  return `${newYr}-${String(newMo + 1).padStart(2, '0')}-${String(newDy).padStart(2, '0')}`
}

function subtractDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function monthKey(dateStr) { return dateStr.slice(0, 7) }

function bucketKey(dateStr, xBucket) {
  if (xBucket === 'week') {
    const d = new Date(dateStr)
    const startOfYear = new Date(d.getFullYear(), 0, 1)
    const week = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7)
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
  }
  if (xBucket === 'month')   return dateStr.slice(0, 7)
  if (xBucket === 'quarter') {
    const [yr, mo] = dateStr.split('-')
    return `${yr}-Q${Math.ceil(+mo / 3)}`
  }
  return dateStr.slice(0, 4)
}

// Return the last date (YYYY-MM-DD) of a bucket key
function bucketEndDate(key, xBucket) {
  if (xBucket === 'month') {
    const [yr, mo] = key.split('-').map(Number)
    const lastDay = new Date(yr, mo, 0).getDate()
    return `${String(yr)}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  }
  if (xBucket === 'quarter') {
    const [yr, qStr] = key.split('-Q')
    const lastMo = +qStr * 3
    const lastDay = new Date(+yr, lastMo, 0).getDate()
    return `${yr}-${String(lastMo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  }
  if (xBucket === 'week') {
    // Week ends 6 days after first day: approximate via bucketKey reverse
    return key // simplified — tooltip still distinguishes past/future by key comparison
  }
  return `${key}-12-31`
}

// Return period label for grouped-by-period mode
function getPeriodLabel(dateStr, xBucket) {
  if (xBucket === 'quarter') {
    const mo = +dateStr.slice(5, 7)
    return `Q${Math.ceil(mo / 3)}`
  }
  if (xBucket === 'month') return PERIOD_LABELS_MONTH[+dateStr.slice(5, 7) - 1]
  return null
}

function fmtPct(n) {
  if (n == null || !isFinite(n)) return '—'
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`
}

function fmtPctPos(n) {
  if (n == null || !isFinite(n)) return '—'
  return `${(n * 100).toFixed(2)}%`
}

function fmtMC(n, mc) {
  if (n == null) return '—'
  return `${fmtAmt(n)} ${mc}`
}

function fmtCompact(n) {
  if (n == null || !isFinite(n)) return '—'
  // Compact money display — comma decimal to match the app format (Phase 43k)
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')}K`
  if (Math.abs(n) >= 10)   return n.toFixed(2).replace('.', ',')
  return (n.toFixed(4).replace(/\.?0+$/, '') || '0').replace('.', ',')
}

// Merge apiDividendHistory + user dividends; user records win on (ticker, exDate).
function mergeDividendsForTicker(apiHistory, userDividends) {
  const now = today()
  const merged = new Map()
  for (const r of apiHistory) {
    merged.set(r.exDate, {
      exDate:    r.exDate,
      payDate:   r.payDate,
      perShare:  r.perShare,
      currency:  r.currency,
      type:      r.type ?? 'regular',
      state:     (r.payDate ?? r.exDate) < now ? 'paid' : 'declared',
      source:    'api',
    })
  }
  for (const d of userDividends) {
    if (d.exDividendDate) {
      merged.set(d.exDividendDate, {
        exDate:         d.exDividendDate,
        payDate:        d.payoutDate,
        perShare:       d.dividendPerShare,
        currency:       d.currency,
        type:           d.type ?? 'regular',
        state:          (d.payoutDate ?? d.exDividendDate) < now ? 'paid' : 'declared',
        source:         'user',
        shareCount:     d.shareCount,
        dividendId:     d.id,
        dividendStatus: d.status,
      })
    }
  }
  return [...merged.values()].sort((a, b) => b.exDate.localeCompare(a.exDate))
}

// Compute projected future payouts from merged history (regular only).
function computeProjectedEvents(merged, count = 8) {
  const regular = merged.filter(r => r.type == null || r.type === 'regular')
  if (regular.length < 2) return []

  const dates = regular.map(r => r.payDate ?? r.exDate).filter(Boolean).sort()
  const gaps = []
  for (let i = 1; i < dates.length; i++) {
    const ms = new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()
    gaps.push(ms / 86400000)
  }
  const sorted = [...gaps].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  let cadenceMonths = null
  if (median <=  45) cadenceMonths = 1
  else if (median <= 120) cadenceMonths = 3
  else if (median <= 270) cadenceMonths = 6
  else if (median <= 500) cadenceMonths = 12
  if (!cadenceMonths) return []

  const exPayGaps = regular
    .filter(r => r.exDate && r.payDate)
    .map(r => (new Date(r.payDate).getTime() - new Date(r.exDate).getTime()) / 86400000)
    .filter(g => g > 0 && g < 90)
  const avgExPayGapDays = exPayGaps.length
    ? Math.round(exPayGaps.reduce((s, g) => s + g, 0) / exPayGaps.length)
    : 14

  const lastReg  = regular[0]
  const perShare = lastReg.perShare
  const currency = lastReg.currency
  const now = today()

  const projections = []
  let base  = lastReg.payDate ?? lastReg.exDate
  let steps = 0
  while (projections.length < count && steps < 48) {
    base = addMonths(base, cadenceMonths)
    steps++
    if (base > now) {
      projections.push({
        exDate:  subtractDays(base, avgExPayGapDays),
        payDate: base,
        perShare,
        currency,
        type:   'regular',
        state:  'estimated',
        source: 'projection',
      })
    }
  }
  return projections
}

function computeTtmPerShare(merged) {
  const now = today()
  const cutoff = shiftYear(now, -1)
  return merged
    .filter(r => r.exDate >= cutoff && r.exDate <= now)
    .reduce((s, r) => s + (r.perShare ?? 0), 0)
}

function computeForwardPerShare(merged, apiHistory, userDividends, profile) {
  const freq = detectEffectiveDividendFrequency(
    profile?.dividendFrequency ?? 'unknown',
    { apiHistory, userDividends }
  )
  if (!freq || freq === 'unknown') return null
  const mult = FREQ_MULTIPLIER[freq]
  if (!mult) return null

  const now = today()
  const mergedMap = new Map()
  for (const r of apiHistory) {
    if (r.exDate <= now && (r.type == null || r.type === 'regular')) {
      mergedMap.set(r.exDate, { perShare: r.perShare })
    }
  }
  for (const d of userDividends) {
    if (d.exDividendDate && d.exDividendDate <= now && (d.type == null || d.type === 'regular')) {
      mergedMap.set(d.exDividendDate, { perShare: d.dividendPerShare })
    }
  }
  const sorted = [...mergedMap.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  if (!sorted.length) return null
  const lastPerShare = sorted[0][1].perShare
  if (!lastPerShare || lastPerShare <= 0) return null
  return { perShare: lastPerShare, multiplier: mult, annualised: lastPerShare * mult }
}

function computeCagr(apiHistory, years) {
  const now = today()
  const lastYearStart = shiftYear(now, -1)
  const histYearEnd   = shiftYear(now, -years)
  const histYearStart = shiftYear(now, -(years + 1))

  const regular = apiHistory.filter(r => r.type == null || r.type === 'regular')
  const last12m = regular.filter(r => r.exDate >= lastYearStart && r.exDate <= now)
  const hist12m = regular.filter(r => r.exDate >= histYearStart && r.exDate < histYearEnd)

  if (!last12m.length || !hist12m.length) return null
  const lastSum = last12m.reduce((s, r) => s + (r.perShare ?? 0), 0)
  const histSum = hist12m.reduce((s, r) => s + (r.perShare ?? 0), 0)
  if (histSum === 0) return null
  return Math.pow(lastSum / histSum, 1 / years) - 1
}

// One record per (ticker, exDate). Carries dividendId/Status for user-backed rows.
function buildDividendRecords(heldTickers, dataByTicker, heldData, taxPctByTicker) {
  const records = []
  for (const ticker of heldTickers) {
    const { merged = [], projected = [], profile } = dataByTicker[ticker] ?? {}
    const name   = profile?.name ?? ticker
    const shares = heldData?.[ticker]?.shares ?? 0
    const taxPct = (taxPctByTicker?.[ticker] ?? 0) / 100

    for (const r of merged) {
      records.push({
        ticker, name,
        exDate: r.exDate, payDate: r.payDate,
        perShare: r.perShare, currency: r.currency,
        dividendType: r.type ?? 'regular',
        state: r.state ?? 'declared',
        shares, taxPct,
        dividendId:     r.dividendId     ?? null,
        dividendStatus: r.dividendStatus ?? null,
      })
    }
    for (const r of projected) {
      records.push({
        ticker, name,
        exDate: r.exDate, payDate: r.payDate,
        perShare: r.perShare, currency: r.currency,
        dividendType: r.type ?? 'regular',
        state: 'estimated',
        shares, taxPct,
        dividendId:     null,
        dividendStatus: null,
      })
    }
  }
  return records
}

function recordsToEvents(records) {
  const events = []
  for (const r of records) {
    if (r.exDate)  events.push({ ...r, date: r.exDate,  kind: 'exdiv' })
    if (r.payDate) events.push({ ...r, date: r.payDate, kind: 'pay'   })
  }
  return events
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function DividendPage({ initialTab, onNavigate }) {
  const mainCurrency = getMainCurrency()

  const [accounts]    = useState(() => getInvestingAccounts())
  const [portfolios]  = useState(() => getPortfolios())
  const [assignments] = useState(() => getAllPortfolioAssignments())

  const heldData = useMemo(() => {
    const byTicker = {}
    for (const acc of accounts) {
      for (const pos of getPositions(acc.id)) {
        if (pos.shares > 0) {
          if (!byTicker[pos.ticker]) byTicker[pos.ticker] = { shares: 0, accounts: [] }
          byTicker[pos.ticker].shares   += pos.shares
          byTicker[pos.ticker].accounts.push({ accountId: acc.id, shares: pos.shares, currency: pos.currency })
        }
      }
    }
    return byTicker
  }, [accounts])

  // Tickers with pending dividends but no current open lots (expanded scope per spec 33j/436)
  const pendingDividendTickers = useMemo(() => {
    const pendingSet = new Set()
    for (const acc of accounts) {
      for (const d of getDividends(acc.id)) {
        if (d.status === 'pending-payment' || d.status === 'pending-confirmation') {
          pendingSet.add(d.ticker)
        }
      }
    }
    return [...pendingSet].filter(
      t => !heldData[t] && getStockProfile(t)?.paysDividends !== false
    )
  }, [accounts, heldData])

  const heldTickers = useMemo(
    () => [
      ...Object.keys(heldData).filter(t => getStockProfile(t)?.paysDividends !== false),
      ...pendingDividendTickers,
    ].sort(),
    [heldData, pendingDividendTickers]
  )

  // ── Per-ticker dividend data ──────────────────────────────────────────────
  const [dataByTicker, setDataByTicker] = useState(() => {
    const result = {}
    for (const ticker of heldTickers) {
      const apiHistory    = getApiDividendHistoryForTicker(ticker)
      const userDividends = getDividendsByTicker(ticker)
      const profile       = getStockProfile(ticker)
      const merged        = mergeDividendsForTicker(apiHistory, userDividends)
      const projected     = computeProjectedEvents(merged)
      result[ticker] = { apiHistory, userDividends, profile, merged, projected }
    }
    return result
  })

  function refreshDataForTicker(ticker) {
    const apiHistory    = getApiDividendHistoryForTicker(ticker)
    const userDividends = getDividendsByTicker(ticker)
    const profile       = getStockProfile(ticker)
    const merged        = mergeDividendsForTicker(apiHistory, userDividends)
    const projected     = computeProjectedEvents(merged)
    setDataByTicker(prev => ({ ...prev, [ticker]: { apiHistory, userDividends, profile, merged, projected } }))
  }

  // ── Refresh / reset ───────────────────────────────────────────────────────
  const [refreshing, setRefreshing]     = useState(false)
  const [refreshStatus, setRefreshStatus] = useState({})
  const [resetState, setResetState]     = useState('idle')

  function handleResetApi() {
    setResetState('running')
    resetPageCaches('dividend-page')
    setTimeout(() => { setResetState('done') }, 300)
    setTimeout(() => { setResetState('idle') }, 2300)
  }

  async function handleRefreshAll() {
    setRefreshing(true)
    const statuses = {}
    for (const ticker of heldTickers) {
      setRefreshStatus(prev => ({ ...prev, [ticker]: 'loading' }))
      const profile = dataByTicker[ticker]?.profile
      try {
        await refreshApiDividendHistory(ticker, profile?.exchange)
        statuses[ticker] = 'ok'
        refreshDataForTicker(ticker)
      } catch {
        statuses[ticker] = 'error'
      }
      setRefreshStatus(prev => ({ ...prev, [ticker]: statuses[ticker] }))
    }
    setRefreshing(false)
  }

  // ── Prices for yield calculations ─────────────────────────────────────────
  const [priceByTicker, setPriceByTicker] = useState({})
  const [fxReady, setFxReady] = useState(false)

  useEffect(() => {
    ensureRates(mainCurrency).then(() => setFxReady(true)).catch(() => setFxReady(true))
  }, [mainCurrency])

  useEffect(() => {
    let cancelled = false
    async function loadPrices() {
      const results = {}
      for (const ticker of heldTickers) {
        try {
          const p = await getLatestPrice(ticker, dataByTicker[ticker]?.profile?.exchange)
          if (!cancelled && p) results[ticker] = p
        } catch { /* skip */ }
      }
      if (!cancelled) setPriceByTicker(results)
    }
    if (heldTickers.length) loadPrices()
    return () => { cancelled = true }
  }, [heldTickers, dataByTicker])

  // ── Tab navigation ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(() => {
    if (initialTab === 'pending') return 'pending'
    return 'calendar'
  })

  const [showAddDiv, setShowAddDiv] = useState(false)

  // ── Pending-confirmation records ──────────────────────────────────────────
  const [pendingRecords, setPendingRecords] = useState(() => getPendingConfirmationDividends())

  function refreshPending() {
    setPendingRecords(getPendingConfirmationDividends())
  }

  // ── Calendar state ────────────────────────────────────────────────────────
  const [calView,   setCalView]   = useState(() => appStorage.getItem('rmoney_dividend_calendar_view')   ?? 'table')
  const [calFilter, setCalFilter] = useState(() => appStorage.getItem('rmoney_dividend_calendar_filter') ?? 'pay-only')
  const [calMonth,  setCalMonth]  = useState(() => {
    return appStorage.getItem('rmoney_dividend_calendar_month') ?? today().slice(0, 7)
  })

  function setCalViewP(v)   { setCalView(v);   appStorage.setItem('rmoney_dividend_calendar_view', v) }
  function setCalFilterP(v) { setCalFilter(v); appStorage.setItem('rmoney_dividend_calendar_filter', v) }
  function setCalMonthP(v)  { setCalMonth(v);  appStorage.setItem('rmoney_dividend_calendar_month', v) }

  // ── Metrics state ─────────────────────────────────────────────────────────
  const [metricsGrouping, setMetricsGroupingRaw] = useState(
    () => appStorage.getItem('rmoney_dividend_metrics_grouping') ?? 'company'
  )
  function setMetricsGrouping(v) {
    setMetricsGroupingRaw(v)
    appStorage.setItem('rmoney_dividend_metrics_grouping', v)
  }

  const [visibleColumns, setVisibleColumnsRaw] = useState(() => {
    try {
      const stored = appStorage.getItem('rmoney_dividend_metrics_columns')
      return stored ? JSON.parse(stored) : METRICS_COLUMNS.map(c => c.id)
    } catch { return METRICS_COLUMNS.map(c => c.id) }
  })
  function setVisibleColumns(cols) {
    setVisibleColumnsRaw(cols)
    appStorage.setItem('rmoney_dividend_metrics_columns', JSON.stringify(cols))
  }

  const [sortByGrouping, setSortByGroupingRaw] = useState(() => {
    try {
      const stored = appStorage.getItem('rmoney_dividend_metrics_sort')
      return stored ? JSON.parse(stored) : {}
    } catch { return {} }
  })
  function setSortForGrouping(grouping, col, dir) {
    setSortByGroupingRaw(prev => {
      const next = { ...prev, [grouping]: { col, dir } }
      appStorage.setItem('rmoney_dividend_metrics_sort', JSON.stringify(next))
      return next
    })
  }

  // ── Tax percent per ticker ────────────────────────────────────────────────
  const taxPctByTicker = useMemo(() => {
    const result = {}
    for (const ticker of heldTickers) result[ticker] = resolveDividendTaxPercent(ticker)
    return result
  }, [heldTickers])

  // ── Calendar records + events ─────────────────────────────────────────────
  const calendarRecords = useMemo(
    () => buildDividendRecords(heldTickers, dataByTicker, heldData, taxPctByTicker),
    [heldTickers, dataByTicker, heldData, taxPctByTicker]
  )

  const calendarEvents = useMemo(
    () => recordsToEvents(calendarRecords),
    [calendarRecords]
  )

  // ── Metrics rows ──────────────────────────────────────────────────────────
  const metricsRows = useMemo(() => {
    if (!fxReady) return []
    const now     = today()
    const cut12m  = shiftYear(now, -1)

    // Sum shares across all accounts for a ticker as of a date
    function sharesAsOf(ticker, asOfDate) {
      let total = 0
      for (const acc of accounts) {
        const lots = getOpenLots(acc.id, ticker, asOfDate)
        total += lots.reduce((s, l) => s + l.remainingShares, 0)
      }
      return total
    }

    const rows = []
    for (const ticker of heldTickers) {
      const d = dataByTicker[ticker]
      if (!d) continue
      const { apiHistory, userDividends, profile, merged } = d
      const shares   = heldData[ticker]?.shares ?? 0
      const currency = heldData[ticker]?.accounts?.[0]?.currency ?? 'USD'
      const latestPrice = priceByTicker[ticker]?.price ?? null

      const ttmPerShare = computeTtmPerShare(merged)
      const fwdData     = computeForwardPerShare(merged, apiHistory, userDividends, profile)

      const fxRate = latestPrice
        ? ((convertToMain(latestPrice, currency, mainCurrency) ?? latestPrice) / latestPrice)
        : 1
      const marketValueMain = latestPrice ? latestPrice * shares * fxRate : null
      const ttmYield = latestPrice && ttmPerShare > 0 ? ttmPerShare / latestPrice : null
      const fwdYield = latestPrice && fwdData ? fwdData.annualised / latestPrice : null

      // Last 12m: sum of user dividends that were received in the last year
      const last12mAmt = userDividends
        .filter(r => r.status === 'received' && r.payoutDate >= cut12m && r.payoutDate <= now)
        .reduce((s, r) => {
          const { netTotal } = computeDividendDerived(r)
          return s + (convertToMain(netTotal, r.currency, mainCurrency) ?? 0)
        }, 0)

      // Next 12m: declared future payments using historically-correct share count
      const cutFuture = shiftYear(now, 1)
      const declaredFuture = merged.filter(r => {
        const payRef = r.payDate ?? r.exDate
        return payRef > now && payRef <= cutFuture && r.state === 'declared'
      })
      const estimatedFuture = d.projected.filter(r => {
        const ref = r.payDate ?? r.exDate
        return ref > now && ref <= cutFuture
      })

      let next12mAmt = 0
      for (const r of declaredFuture) {
        let sc
        if (r.source === 'user' && r.shareCount != null) {
          // User-entered record: shareCount is locked at ex-div date (33f spec)
          sc = r.shareCount
        } else if (r.exDate && r.exDate <= now) {
          // API row with past ex-div: look up actual holdings on ex-div date
          sc = sharesAsOf(ticker, subtractDays(r.exDate, 1))
        } else {
          sc = shares
        }
        next12mAmt += (r.perShare ?? 0) * sc * fxRate
      }
      for (const r of estimatedFuture) {
        next12mAmt += (r.perShare ?? 0) * shares * fxRate
      }

      rows.push({
        ticker,
        name:      profile?.name ?? ticker,
        country:   getEffectiveHqCountry(profile),
        region:    countryDetailRegion(getEffectiveHqCountry(profile)),
        continent: continentRegion(getEffectiveHqCountry(profile)),
        portfolio: assignments.find(a => a.ticker === ticker)?.portfolioId ?? null,
        marketValueMain,
        ttmYield,
        fwdYield,
        last12mAmt,
        next12mAmt,
        cagr3:  computeCagr(apiHistory, 3),
        cagr5:  computeCagr(apiHistory, 5),
        cagr10: computeCagr(apiHistory, 10),
      })
    }
    return rows
  }, [heldTickers, dataByTicker, heldData, priceByTicker, fxReady, mainCurrency, assignments, accounts])

  // ── Last refresh timestamp ────────────────────────────────────────────────
  const lastRefreshAt = heldTickers.length > 0
    ? heldTickers.map(t => getRefreshMeta(t)?.lastRefreshedAt).filter(Boolean).sort().at(-1)
    : null

  if (heldTickers.length === 0) {
    return (
      <div className={styles.emptyPage}>
        <h2 className={styles.emptyTitle}>No held positions</h2>
        <p className={styles.emptyMsg}>
          This page shows dividends for stocks you currently hold. Add stock buy transactions to get started.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.pageTitle}>Dividends</h1>
          <span className={styles.scopeLabel}>held stocks only · {heldTickers.length} ticker{heldTickers.length !== 1 ? 's' : ''}</span>
          {lastRefreshAt && (
            <span className={styles.lastRefresh}>
              Last refresh: {new Date(lastRefreshAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className={styles.headerRight}>
          <StaleIndicators heldTickers={heldTickers} refreshStatus={refreshStatus} />
          <button className={styles.addDivBtn} onClick={() => setShowAddDiv(true)} title="Add a new dividend record">
            + Add dividend
          </button>
          <button
            className={styles.refreshBtn}
            onClick={handleRefreshAll}
            disabled={refreshing}
            title="Fetch the latest dividend history for all held tickers"
          >
            {refreshing ? 'Refreshing…' : 'Refresh dividend data'}
          </button>
          <button
            className={styles.refreshBtn}
            onClick={handleResetApi}
            disabled={resetState !== 'idle'}
            title="Clear cached prices and forex rates so the next load fetches fresh data"
          >
            {resetState === 'running' ? 'Resetting…' : resetState === 'done' ? 'Refreshed ✓' : 'Reset API'}
          </button>
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div className={styles.tabBar}>
        <button className={`${styles.tabBtn} ${activeTab === 'calendar' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('calendar')} title="Show the dividend calendar">Calendar</button>
        <button className={`${styles.tabBtn} ${activeTab === 'metrics'  ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('metrics')} title="Show dividend metrics and charts">Metrics</button>
        <button className={`${styles.tabBtn} ${activeTab === 'pending'  ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('pending')} title="Show dividends awaiting confirmation">
          Pending
          {pendingRecords.length > 0 && <span className={styles.pendingBadge}>{pendingRecords.length}</span>}
        </button>
      </div>

      {/* ── Add dividend overlay ──────────────────────────────────────────── */}
      {showAddDiv && (
        <div className={styles.formOverlay}>
          <div className={styles.formOverlayInner}>
            <MultiAccountDividendForm
              tickerLocked={false}
              heldTickers={heldTickers}
              onSaved={() => {
                setShowAddDiv(false)
                for (const t of heldTickers) refreshDataForTicker(t)
                refreshPending()
              }}
              onCancel={() => setShowAddDiv(false)}
            />
          </div>
        </div>
      )}

      {/* ── Calendar tab ──────────────────────────────────────────────────── */}
      {activeTab === 'calendar' && (
        <CalendarTab
          events={calendarEvents}
          records={calendarRecords}
          calView={calView}
          setCalView={setCalViewP}
          calFilter={calFilter}
          setCalFilter={setCalFilterP}
          calMonth={calMonth}
          setCalMonth={setCalMonthP}
          dataByTicker={dataByTicker}
          onNavigate={onNavigate}
          onRecordChange={refreshDataForTicker}
        />
      )}

      {/* ── Metrics tab ───────────────────────────────────────────────────── */}
      {activeTab === 'metrics' && (
        <MetricsTab
          heldTickers={heldTickers}
          dataByTicker={dataByTicker}
          heldData={heldData}
          metricsRows={metricsRows}
          metricsGrouping={metricsGrouping}
          setMetricsGrouping={setMetricsGrouping}
          visibleColumns={visibleColumns}
          setVisibleColumns={setVisibleColumns}
          sortByGrouping={sortByGrouping}
          setSortForGrouping={setSortForGrouping}
          mainCurrency={mainCurrency}
          portfolios={portfolios}
          assignments={assignments}
          onNavigate={onNavigate}
          taxPctByTicker={taxPctByTicker}
        />
      )}

      {/* ── Pending tab ───────────────────────────────────────────────────── */}
      {activeTab === 'pending' && (
        <PendingTab
          records={pendingRecords}
          accounts={accounts}
          onRefresh={refreshPending}
        />
      )}
    </div>
  )
}

// ─── PendingTab ───────────────────────────────────────────────────────────────

function PendingTab({ records, accounts, onRefresh }) {
  const [editId, setEditId]       = useState(null)
  const [editDraft, setEditDraft] = useState({})

  const accountById = useMemo(() => {
    const map = {}
    for (const a of accounts) map[a.id] = a
    return map
  }, [accounts])

  function handleConfirm(id) { confirmDividend(id); onRefresh() }
  function handleConfirmAll() { for (const r of records) confirmDividend(r.id); onRefresh() }
  function handleDelete(id)  { deleteDividend(id);  onRefresh() }
  function handleEditStart(r) {
    setEditId(r.id)
    setEditDraft({ dividendPerShare: r.dividendPerShare, taxPercent: r.taxPercent })
  }
  function handleEditSave(r) {
    updateDividend(r.id, { dividendPerShare: parseAmount(editDraft.dividendPerShare), taxPercent: editDraft.taxPercent, type: r.type })
    setEditId(null)
    onRefresh()
  }

  if (records.length === 0) {
    return (
      <div className={styles.pendingEmpty}>
        <p>No dividends awaiting confirmation.</p>
        <p className={styles.pendingEmptyHint}>
          Enable "Confirm receipt before cash impact" in Settings → Investments → Dividends to use this queue.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.pendingTab}>
      <div className={styles.pendingHeader}>
        <span>{records.length} dividend{records.length !== 1 ? 's' : ''} awaiting confirmation</span>
        <button className={styles.confirmAllBtn} onClick={handleConfirmAll} title="Confirm receipt of all pending dividends">Confirm all</button>
      </div>
      <div className={styles.pendingTableWrap}>
        <table className={styles.tableEl}>
          <thead>
            <tr>
              <th>Ticker</th><th>Account</th><th>Ex-div</th><th>Pay date</th>
              <th className={styles.numTh}>Per share</th><th className={styles.numTh}>Shares</th>
              <th className={styles.numTh}>Tax %</th><th className={styles.numTh}>Net total</th>
              <th>Source</th><th></th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => {
              const { netTotal } = computeDividendDerived(r)
              const acct    = accountById[r.investingAccountId]
              const isEditing = editId === r.id
              return (
                <tr key={r.id}>
                  <td className={styles.tickerCell}>{r.ticker}</td>
                  <td>{acct?.name ?? r.investingAccountId}</td>
                  <td>{r.exDividendDate}</td>
                  <td>{r.payoutDate}</td>
                  {isEditing ? (
                    <>
                      <td className={styles.numTd}>
                        <AmountInput className={styles.editInput}
                          value={editDraft.dividendPerShare}
                          onChange={v => setEditDraft(prev => ({ ...prev, dividendPerShare: v }))} />
                      </td>
                      <td className={styles.numTd}>{r.shareCount}</td>
                      <td className={styles.numTd}>
                        <input type="number" step="0.01" min="0" max="100" className={styles.editInput}
                          value={editDraft.taxPercent}
                          onChange={e => setEditDraft(prev => ({ ...prev, taxPercent: e.target.value }))} />
                      </td>
                      <td className={styles.numTd}>—</td>
                    </>
                  ) : (
                    <>
                      <td className={styles.numTd}>{fmtPriceAmt(r.dividendPerShare, 4)} {r.currency}</td>
                      <td className={styles.numTd}>{r.shareCount}</td>
                      <td className={styles.numTd}>{r.taxPercent}%</td>
                      <td className={styles.numTd}>{fmtAmt(netTotal)} {r.currency}</td>
                    </>
                  )}
                  <td>
                    <span className={r.source === 'api-auto' ? styles.sourceApi : styles.sourceUser}>
                      {r.source === 'api-auto' ? 'API' : 'User'}
                    </span>
                  </td>
                  <td className={styles.pendingActions}>
                    {isEditing ? (
                      <>
                        <button className={styles.confirmBtn} onClick={() => handleEditSave(r)} title="Save changes to this dividend">Save</button>
                        <button className={styles.skipBtn} onClick={() => setEditId(null)} title="Discard changes">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className={styles.confirmBtn} onClick={() => handleConfirm(r.id)} title="Confirm receipt of this dividend">Confirm</button>
                        <button className={styles.editBtn}    onClick={() => handleEditStart(r)} title="Edit this dividend before confirming">Edit</button>
                        <button className={styles.skipBtn}    onClick={() => handleDelete(r.id)} title="Delete this dividend">Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── StaleIndicators ──────────────────────────────────────────────────────────

function StaleIndicators({ heldTickers, refreshStatus }) {
  const stale = heldTickers.filter(t => {
    const s = refreshStatus[t]
    if (s === 'ok' || s === 'loading') return false
    return isStaleForTicker(t)
  })
  if (!stale.length) return null
  return (
    <span className={styles.staleChip} title={`Stale data: ${stale.join(', ')}`}>
      ● {stale.length} stale
    </span>
  )
}

// ─── CalendarTab ──────────────────────────────────────────────────────────────

function CalendarTab({ events, records, calView, setCalView, calFilter, setCalFilter, calMonth, setCalMonth, dataByTicker, onNavigate, onRecordChange }) {
  const [popupDay, setPopupDay] = useState(null)

  function prevMonth() {
    const [yr, mo] = calMonth.split('-').map(Number)
    const d = new Date(yr, mo - 2, 1)
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  function nextMonth() {
    const [yr, mo] = calMonth.split('-').map(Number)
    const d = new Date(yr, mo, 1)
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  function goToday() { setCalMonth(today().slice(0, 7)) }

  const filteredEvents = useMemo(() => {
    let ev = events.filter(e => e.date.startsWith(calMonth))
    if (calFilter === 'pay-only') ev = ev.filter(e => e.kind === 'pay')
    return ev
  }, [events, calMonth, calFilter])

  const eventsByDay = useMemo(() => {
    const map = {}
    for (const e of filteredEvents) {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    }
    return map
  }, [filteredEvents])

  const [yr, mo] = calMonth.split('-').map(Number)
  const monthLabel = new Date(yr, mo - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className={styles.calendarTab}>
      <div className={styles.calControls}>
        <div className={styles.viewToggle}>
          <button className={`${styles.viewBtn} ${calView === 'month' ? styles.viewBtnActive : ''}`} onClick={() => setCalView('month')} title="Switch to the month calendar view">Month</button>
          <button className={`${styles.viewBtn} ${calView === 'table' ? styles.viewBtnActive : ''}`} onClick={() => setCalView('table')} title="Switch to the table view">Table</button>
        </div>
        {calView === 'month' && (
          <div className={styles.monthNav}>
            <button className={styles.navBtn} onClick={prevMonth} title="Show the previous month">‹</button>
            <span className={styles.monthLabel}>{monthLabel}</span>
            <button className={styles.navBtn} onClick={nextMonth} title="Show the next month">›</button>
            <button className={styles.navBtnSm} onClick={goToday} title="Jump to the current month">Today</button>
          </div>
        )}
        {calView === 'month' && (
          <div className={styles.filterToggle}>
            <button className={`${styles.viewBtn} ${calFilter === 'both'     ? styles.viewBtnActive : ''}`} onClick={() => setCalFilter('both')} title="Show both ex-dividend and pay-date events">Ex-div + Pay</button>
            <button className={`${styles.viewBtn} ${calFilter === 'pay-only' ? styles.viewBtnActive : ''}`} onClick={() => setCalFilter('pay-only')} title="Show only pay-date events">Pay only</button>
          </div>
        )}
      </div>

      {calView === 'month' ? (
        <MonthGrid calMonth={calMonth} eventsByDay={eventsByDay} popupDay={popupDay} setPopupDay={setPopupDay} />
      ) : (
        <CalendarTable
          records={records}
          calMonth={calMonth}
          onNavigate={onNavigate}
          onRecordChange={onRecordChange}
        />
      )}
    </div>
  )
}

// ─── MonthGrid ────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function MonthGrid({ calMonth, eventsByDay, popupDay, setPopupDay }) {
  const [yr, mo] = calMonth.split('-').map(Number)
  const firstDay    = new Date(yr, mo - 1, 1)
  const daysInMonth = new Date(yr, mo, 0).getDate()
  const startOffset = (firstDay.getDay() + 6) % 7

  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${yr}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className={styles.monthGrid}>
      {WEEKDAYS.map(w => (
        <div key={w} className={styles.weekdayHeader}>{w}</div>
      ))}
      {cells.map((dateStr, i) => {
        if (!dateStr) return <div key={`empty-${i}`} className={styles.dayCell} />
        const dayEvents = eventsByDay[dateStr] ?? []
        const isToday   = dateStr === today()
        const hasPop    = popupDay === dateStr
        const maxInline = 2
        const overflow  = dayEvents.length > maxInline ? dayEvents.length - maxInline : 0

        return (
          <div key={dateStr} className={`${styles.dayCell} ${isToday ? styles.dayCellToday : ''}`}>
            <span className={styles.dayNum}>{+dateStr.slice(8)}</span>
            <div className={styles.dotList}>
              {dayEvents.slice(0, overflow ? maxInline : dayEvents.length).map((e, j) => {
                const totalGross = (e.perShare ?? 0) * (e.shares ?? 0)
                const totalNet   = totalGross * (1 - (e.taxPct ?? 0))
                return (
                  <div key={j} className={styles.dotRow}>
                    <span className={`${styles.dot} ${e.kind === 'pay' ? styles.dotGreen : styles.dotBlue} ${e.state === 'estimated' ? styles.dotDashed : ''}`} />
                    <span className={styles.dotTicker}>{e.ticker}</span>
                    <span className={styles.dotNum} title="Per share (gross)">{fmtCompact(e.perShare)}</span>
                    <span className={styles.dotNum} title="Total gross">{fmtCompact(totalGross)}</span>
                    <span className={styles.dotNum} title="Total net">{fmtCompact(totalNet)}</span>
                  </div>
                )
              })}
              {overflow > 0 && (
                <button className={styles.overflowLink} onClick={() => setPopupDay(hasPop ? null : dateStr)} title={hasPop ? 'Hide the events for this day' : 'Show all events for this day'}>
                  +{overflow} more
                </button>
              )}
            </div>
            {hasPop && <DayPopup events={dayEvents} onClose={() => setPopupDay(null)} />}
          </div>
        )
      })}
    </div>
  )
}

function DayPopup({ events, onClose }) {
  const ref = useRef()
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className={styles.dayPopup} ref={ref}>
      <button className={styles.popupClose} onClick={onClose} title="Close this popup">×</button>
      {events.map((e, i) => (
        <div key={i} className={styles.popupRow}>
          <span className={`${styles.dot} ${e.kind === 'pay' ? styles.dotGreen : styles.dotBlue} ${e.state === 'estimated' ? styles.dotDashed : ''}`} />
          <span className={styles.popupTicker}>{e.ticker}</span>
          <span className={styles.popupName}>{e.name}</span>
          <span className={styles.popupKind}>{e.kind === 'pay' ? 'Pay' : 'Ex-div'}</span>
          {e.perShare != null && <span className={styles.popupAmt}>{fmtPriceAmt(e.perShare, 4)} {e.currency}/sh</span>}
          <span className={`${styles.popupState} ${e.state === 'estimated' ? styles.stateEstimated : ''}`}>{e.state}</span>
        </div>
      ))}
    </div>
  )
}

// ─── CalendarTable ────────────────────────────────────────────────────────────

const TABLE_CHUNK_MONTHS = 3

function CalendarTable({ records, calMonth, onNavigate, onRecordChange }) {
  const [monthsShown, setMonthsShown] = useState(TABLE_CHUNK_MONTHS)
  const [sort, setSort]               = useState({ col: 'exDate', dir: 'asc' })
  const [editRecord, setEditRecord]   = useState(null)  // full dividends record
  const [deleteRecord, setDeleteRecord] = useState(null) // full dividends record
  const loadMoreRef = useRef()

  useEffect(() => { setMonthsShown(TABLE_CHUNK_MONTHS) }, [calMonth])

  useEffect(() => {
    if (!loadMoreRef.current) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setMonthsShown(prev => prev + TABLE_CHUNK_MONTHS)
    }, { threshold: 0.1 })
    obs.observe(loadMoreRef.current)
    return () => obs.disconnect()
  }, [])

  function handleSort(col) {
    setSort(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }))
  }

  function openEdit(calRow) {
    const div = getDividend(calRow.dividendId)
    if (div) setEditRecord(div)
  }

  function openDelete(calRow) {
    const div = getDividend(calRow.dividendId)
    if (div) setDeleteRecord(div)
  }

  const now = today()

  const tableRecords = useMemo(() => {
    return records
      .filter(r => {
        const latest = r.payDate ?? r.exDate
        return latest && latest >= now
      })
      .sort((a, b) => {
        const av = (sort.col === 'payDate' ? (a.payDate ?? a.exDate) : (a.exDate ?? a.payDate)) ?? ''
        const bv = (sort.col === 'payDate' ? (b.payDate ?? b.exDate) : (b.exDate ?? b.payDate)) ?? ''
        return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      })
  }, [records, now, sort])

  const cutoffDate = useMemo(() => {
    const [yr, mo] = now.split('-').map(Number)
    let newMo = mo - 1 + monthsShown
    let newYr = yr + Math.floor(newMo / 12)
    newMo = ((newMo % 12) + 12) % 12
    return `${newYr}-${String(newMo + 1).padStart(2, '0')}-31`
  }, [now, monthsShown])

  const visibleRecords = tableRecords.filter(r => (r.exDate ?? r.payDate) <= cutoffDate)
  const hasMore = tableRecords.some(r => (r.exDate ?? r.payDate) > cutoffDate)

  return (
    <div className={styles.calTable}>
      <table className={styles.tableEl}>
        <thead>
          <tr>
            <th className={styles.sortableHeader} onClick={() => handleSort('exDate')}>
              Ex-div{sort.col === 'exDate' && <span className={styles.sortArrow}>{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
            </th>
            <th className={styles.sortableHeader} onClick={() => handleSort('payDate')}>
              Pay date{sort.col === 'payDate' && <span className={styles.sortArrow}>{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
            </th>
            <th>Ticker</th>
            <th>Name</th>
            <th className={styles.numTh}>Per share</th>
            <th>Div type</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visibleRecords.length === 0 ? (
            <tr><td colSpan={8} className={styles.emptyCell}>No upcoming dividends in this period</td></tr>
          ) : (
            visibleRecords.map((r, i) => (
              <tr key={i} className={r.state === 'estimated' ? styles.estimatedRow : ''}>
                <td>{r.exDate ?? '—'}</td>
                <td>{r.payDate ?? '—'}</td>
                <td>
                  <button
                    className={styles.tickerLink}
                    onClick={() => onNavigate?.('stock', { ticker: r.ticker })}
                    title="Open this stock's page"
                  >
                    {r.ticker}
                  </button>
                </td>
                <td>{r.name}</td>
                <td className={styles.numTd}>{r.perShare != null ? `${fmtPriceAmt(r.perShare, 4)} ${r.currency}` : '—'}</td>
                <td>
                  <span className={r.dividendType === 'special' ? styles.typeSpecial : styles.typeRegular}>
                    {r.dividendType === 'special' ? 'Special' : 'Regular'}
                  </span>
                </td>
                <td>
                  <span className={r.state === 'estimated' ? styles.stateEstimated : styles.stateDeclared}>
                    {r.state}
                  </span>
                </td>
                <td className={styles.calActionsCell}>
                  {r.dividendId && (
                    <>
                      <button className={styles.editBtn} onClick={() => openEdit(r)} title="Edit">✎</button>
                      <button className={styles.deleteBtn} onClick={() => openDelete(r)} title="Delete">🗑</button>
                    </>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {hasMore && <div ref={loadMoreRef} className={styles.loadMoreSentinel} />}
      {hasMore && (
        <button className={styles.loadMoreBtn} onClick={() => setMonthsShown(prev => prev + TABLE_CHUNK_MONTHS)} title="Show three more months of upcoming dividends">
          Load more months
        </button>
      )}

      {editRecord && (
        <EditDividendDialog
          dividend={editRecord}
          onSave={fields => {
            updateDividend(editRecord.id, fields)
            setEditRecord(null)
            onRecordChange?.(editRecord.ticker)
          }}
          onCancel={() => setEditRecord(null)}
        />
      )}

      {deleteRecord && (
        <DeleteDividendConfirm
          dividend={deleteRecord}
          onConfirm={() => {
            deleteDividend(deleteRecord.id)
            setDeleteRecord(null)
            onRecordChange?.(deleteRecord.ticker)
          }}
          onCancel={() => setDeleteRecord(null)}
        />
      )}
    </div>
  )
}

// ─── EditDividendDialog ───────────────────────────────────────────────────────

function EditDividendDialog({ dividend, onSave, onCancel }) {
  const [perShare, setPerShare] = useState(String(dividend.dividendPerShare ?? ''))
  const [taxPct,   setTaxPct]   = useState(String(dividend.taxPercent ?? 0))
  const [type,     setType]     = useState(dividend.type ?? 'regular')

  function handleSubmit(e) {
    e.preventDefault()
    onSave({ dividendPerShare: parseAmount(perShare), taxPercent: Number(taxPct), type })
  }

  return (
    <div className={styles.dialogBackdrop} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.dialogBox}>
        <h2 className={styles.dialogTitle}>Edit dividend — {dividend.ticker}</h2>
        <p className={styles.dialogNote}>{dividend.payoutDate} · {dividend.shareCount} shares</p>
        <form onSubmit={handleSubmit}>
          <div className={styles.dialogField}>
            <label className={styles.dialogLabel}>Per share</label>
            <AmountInput className={styles.dialogInput}
              value={perShare} onChange={v => setPerShare(v)} autoFocus />
          </div>
          <div className={styles.dialogRow}>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Tax %</label>
              <input className={styles.dialogInput} type="number" min="0" max="100" step="any"
                value={taxPct} onChange={e => setTaxPct(e.target.value)} />
            </div>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Type</label>
              <select className={styles.dialogSelect} value={type} onChange={e => setType(e.target.value)}>
                <option value="regular">Regular</option>
                <option value="special">Special</option>
              </select>
            </div>
          </div>
          <div className={styles.dialogActions}>
            <button type="button" className={styles.dialogCancelBtn} onClick={onCancel} title="Discard changes and close">Cancel</button>
            <button type="submit" className={styles.dialogSaveBtn} disabled={!perShare} title="Save changes to this dividend">Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── DeleteDividendConfirm ────────────────────────────────────────────────────

function DeleteDividendConfirm({ dividend, onConfirm, onCancel }) {
  const { netTotal } = computeDividendDerived(dividend)
  const isReceived = dividend.status === 'received'

  return (
    <div className={styles.dialogBackdrop} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.dialogBox}>
        <h2 className={styles.dialogTitle}>Delete dividend — {dividend.ticker}</h2>
        <p className={styles.dialogNote}>
          {dividend.exDividendDate ? `Ex-div: ${dividend.exDividendDate}` : ''}
          {dividend.payoutDate ? ` · Pay: ${dividend.payoutDate}` : ''}
        </p>
        <p className={styles.dialogNote}>
          {fmtPriceAmt(dividend.dividendPerShare, 4)} {dividend.currency}/sh × {dividend.shareCount} shares → net {fmtAmt(netTotal)} {dividend.currency}
        </p>
        {isReceived && (
          <p className={styles.dialogWarning}>
            This dividend was already received — deleting will also remove the linked cash movement.
          </p>
        )}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogCancelBtn} onClick={onCancel} title="Keep this dividend">Cancel</button>
          <button type="button" className={styles.btnSmDanger} onClick={onConfirm} title="Delete this dividend permanently">Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── MetricsTab ───────────────────────────────────────────────────────────────

function MetricsTab({
  heldTickers, dataByTicker, heldData, metricsRows, metricsGrouping, setMetricsGrouping,
  visibleColumns, setVisibleColumns, sortByGrouping, setSortForGrouping, mainCurrency,
  portfolios, assignments, onNavigate, taxPctByTicker,
}) {
  const [chartPresets,    setChartPresets]    = useState(() => getDividendChartPresets())
  const [activePresetId,  setActivePresetId]  = useState(() => getDividendChartPresets()[0]?.id ?? null)
  const [editPresetId,    setEditPresetId]    = useState(null)
  const [presetNameDraft, setPresetNameDraft] = useState('')
  const [showColPicker,   setShowColPicker]   = useState(false)

  const activePreset = chartPresets.find(p => p.id === activePresetId) ?? null

  function handleCreatePreset() {
    const p = createDividendChartPreset({ name: 'New chart' })
    setChartPresets(getDividendChartPresets())
    setActivePresetId(p.id)
  }

  function handleDeletePreset(id) {
    deleteDividendChartPreset(id)
    const remaining = getDividendChartPresets()
    setChartPresets(remaining)
    if (activePresetId === id) setActivePresetId(remaining[0]?.id ?? null)
  }

  function updatePreset(fields) {
    if (!activePresetId) return
    updateDividendChartPreset(activePresetId, fields)
    setChartPresets(getDividendChartPresets())
  }

  // Build chart data including paid/toBePaid for tooltips and grouped-by-period data
  const chartData = useMemo(() => {
    if (!activePreset) return { buckets: [], datasets: [], grouped: null, periods: null, years: null }
    const { xBucket, filters, groupedByPeriod } = activePreset

    const now      = today()
    const yearFrom = filters.yearFrom ?? (+now.slice(0, 4) - 2)
    const yearTo   = filters.yearTo   ?? (+now.slice(0, 4))

    const allEvents = []
    for (const ticker of heldTickers) {
      const d = dataByTicker[ticker]
      if (!d) continue
      const { merged, projected } = d
      const shares  = heldData[ticker]?.shares ?? 0
      const taxRate = (taxPctByTicker?.[ticker] ?? 0) / 100

      for (const r of merged) {
        if (r.exDate < `${yearFrom}-01-01` || r.exDate > `${yearTo}-12-31`) continue
        if (filters.companies?.length && !filters.companies.includes(ticker)) continue
        const amount    = (r.perShare ?? 0) * shares
        const netAmount = amount * (1 - taxRate)
        allEvents.push({ date: r.payDate ?? r.exDate, amount, netAmount, state: r.state, ticker })
      }
      for (const r of projected) {
        const ref = r.payDate ?? r.exDate
        if (ref < `${yearFrom}-01-01` || ref > `${yearTo}-12-31`) continue
        if (filters.companies?.length && !filters.companies.includes(ticker)) continue
        const amount    = (r.perShare ?? 0) * shares
        const netAmount = amount * (1 - taxRate)
        allEvents.push({ date: ref, amount, netAmount, state: 'estimated', ticker })
      }
    }

    // Normal bucket mode
    const bucketMap = new Map()
    for (const ev of allEvents) {
      const key = bucketKey(ev.date, xBucket)
      if (!bucketMap.has(key)) bucketMap.set(key, { declared: 0, estimated: 0, paid: 0, toBePaid: 0, paidNet: 0, toBePaidNet: 0 })
      const b = bucketMap.get(key)
      if (ev.state === 'estimated') b.estimated += ev.amount
      else b.declared += ev.amount
      if (ev.date <= now) { b.paid += ev.amount; b.paidNet += ev.netAmount }
      else { b.toBePaid += ev.amount; b.toBePaidNet += ev.netAmount }
    }
    const buckets = [...bucketMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, val]) => ({ key, ...val, total: val.declared + val.estimated }))

    // Grouped-by-period mode
    let grouped = null; let periods = null; let years = null
    if (groupedByPeriod && (xBucket === 'month' || xBucket === 'quarter')) {
      periods = xBucket === 'quarter' ? PERIOD_LABELS_QUARTER : PERIOD_LABELS_MONTH
      years   = []
      for (let y = yearFrom; y <= yearTo; y++) years.push(String(y))
      grouped = {}
      for (const p of periods) {
        grouped[p] = {}
        for (const y of years) grouped[p][y] = { declared: 0, estimated: 0, paid: 0, toBePaid: 0, paidNet: 0, toBePaidNet: 0 }
      }
      for (const ev of allEvents) {
        const pl = getPeriodLabel(ev.date, xBucket)
        const yl = ev.date.slice(0, 4)
        if (!grouped[pl]?.[yl]) continue
        const c = grouped[pl][yl]
        if (ev.state === 'estimated') c.estimated += ev.amount
        else c.declared += ev.amount
        if (ev.date <= now) { c.paid += ev.amount; c.paidNet += ev.netAmount }
        else { c.toBePaid += ev.amount; c.toBePaidNet += ev.netAmount }
      }
    }

    return { buckets, datasets: [{ label: 'All holdings', color: CHART_COLORS[0] }], grouped, periods, years }
  }, [activePreset, heldTickers, dataByTicker, heldData, taxPctByTicker])

  // ── Metrics table ─────────────────────────────────────────────────────────
  const sort = sortByGrouping[metricsGrouping] ?? { col: 'last12m', dir: 'desc' }

  function handleSort(col) {
    const dir = sort.col === col && sort.dir === 'desc' ? 'asc' : 'desc'
    setSortForGrouping(metricsGrouping, col, dir)
  }

  const groupedRows = useMemo(() => {
    const rows = [...metricsRows]
    const getKey = r => {
      if (metricsGrouping === 'company')   return r.ticker
      if (metricsGrouping === 'portfolio') return portfolios.find(p => p.id === r.portfolio)?.name ?? 'Unassigned'
      if (metricsGrouping === 'country')   return r.country   ?? 'Unknown'
      if (metricsGrouping === 'region')    return r.region    ?? 'Unknown'
      if (metricsGrouping === 'continent') return r.continent ?? 'Unknown'
      return r.ticker
    }
    const getLabel = r => metricsGrouping === 'company' ? r.name : getKey(r)

    if (metricsGrouping === 'company') {
      return applySortToRows(rows, sort).map(r => ({
        key: r.ticker, label: r.name, ticker: r.ticker,
        ttmYield: r.ttmYield, fwdYield: r.fwdYield,
        last12mAmt: r.last12mAmt, next12mAmt: r.next12mAmt,
        cagr3: r.cagr3, cagr5: r.cagr5, cagr10: r.cagr10,
        marketValueMain: r.marketValueMain, subRows: [],
      }))
    }

    const groups = new Map()
    for (const r of rows) {
      const key = getKey(r)
      if (!groups.has(key)) groups.set(key, { key, label: getLabel(r), rows: [] })
      groups.get(key).rows.push(r)
    }
    const aggGroups = [...groups.values()].map(({ key, label, rows: gRows }) => {
      const totalMV = gRows.reduce((s, r) => s + (r.marketValueMain ?? 0), 0)
      const wmAvg = field => {
        if (!totalMV) return null
        return gRows.reduce((s, r) => s + (r[field] ?? 0) * (r.marketValueMain ?? 0), 0) / totalMV
      }
      return {
        key, label,
        ttmYield:  wmAvg('ttmYield'),  fwdYield: wmAvg('fwdYield'),
        last12mAmt: gRows.reduce((s, r) => s + (r.last12mAmt ?? 0), 0),
        next12mAmt: gRows.reduce((s, r) => s + (r.next12mAmt ?? 0), 0),
        cagr3: wmAvg('cagr3'), cagr5: wmAvg('cagr5'), cagr10: wmAvg('cagr10'),
        marketValueMain: totalMV, subRows: gRows,
      }
    })
    return applySortToRows(aggGroups, sort)
  }, [metricsRows, metricsGrouping, sort, portfolios])

  function applySortToRows(rows, sort) {
    const fieldMap = { ttmYield: 'ttmYield', fwdYield: 'fwdYield', last12m: 'last12mAmt', next12m: 'next12mAmt', cagr3: 'cagr3', cagr5: 'cagr5', cagr10: 'cagr10' }
    const field = fieldMap[sort.col] ?? 'last12mAmt'
    const { dir } = sort
    return [...rows].sort((a, b) => {
      const av = a[field] ?? (dir === 'asc' ? Infinity : -Infinity)
      const bv = b[field] ?? (dir === 'asc' ? Infinity : -Infinity)
      return dir === 'asc' ? av - bv : bv - av
    })
  }

  const shownColumns = METRICS_COLUMNS.filter(c => visibleColumns.includes(c.id))
  const groupedByPeriodDisabled = activePreset?.xBucket === 'week' || activePreset?.xBucket === 'year'

  return (
    <div className={styles.metricsTab}>
      {/* ── Payout chart ────────────────────────────────────────────────── */}
      <section className={styles.chartSection}>
        <div className={styles.chartHeader}>
          <h2 className={styles.sectionTitle}>Payout chart</h2>
          <div className={styles.presetRow}>
            {chartPresets.map(p => (
              <button key={p.id}
                className={`${styles.presetBtn} ${p.id === activePresetId ? styles.presetBtnActive : ''}`}
                onClick={() => setActivePresetId(p.id)}
                title={`Show the "${p.name}" chart`}
              >{p.name}</button>
            ))}
            <button className={styles.presetBtnAdd} onClick={handleCreatePreset} title="Create a new chart preset">+ New</button>
          </div>
        </div>

        {activePreset && (
          <>
            <div className={styles.chartControls}>
              {/* Preset name */}
              <div className={styles.ctrlGroup}>
                <label className={styles.ctrlLabel}>Name</label>
                {editPresetId === activePresetId ? (
                  <input className={styles.presetNameInput} value={presetNameDraft}
                    onChange={e => setPresetNameDraft(e.target.value)}
                    onBlur={() => { updatePreset({ name: presetNameDraft || activePreset.name }); setEditPresetId(null) }}
                    autoFocus />
                ) : (
                  <button className={styles.presetNameBtn} onClick={() => { setPresetNameDraft(activePreset.name); setEditPresetId(activePresetId) }} title="Rename this chart preset">
                    {activePreset.name} ✎
                  </button>
                )}
              </div>

              {/* X bucket */}
              <div className={styles.ctrlGroup}>
                <label className={styles.ctrlLabel}>X axis</label>
                <select className={styles.ctrlSelect} value={activePreset.xBucket}
                  onChange={e => updatePreset({ xBucket: e.target.value, groupedByPeriod: false })}>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="quarter">Quarter</option>
                  <option value="year">Year</option>
                </select>
              </div>

              {/* Y type */}
              <div className={styles.ctrlGroup}>
                <label className={styles.ctrlLabel}>Y axis</label>
                <select className={styles.ctrlSelect} value={activePreset.yType}
                  onChange={e => updatePreset({ yType: e.target.value })}>
                  <option value="gross">Gross</option>
                  <option value="net">Net</option>
                </select>
              </div>

              {/* Chart type */}
              <div className={styles.ctrlGroup}>
                <label className={styles.ctrlLabel}>Chart</label>
                <select className={styles.ctrlSelect} value={activePreset.chartType}
                  onChange={e => updatePreset({ chartType: e.target.value })}>
                  <option value="bar">Bar</option>
                  <option value="line">Line</option>
                </select>
              </div>

              {/* Grouped by period toggle */}
              <div className={styles.ctrlGroup}>
                <label className={styles.ctrlLabel}>By period</label>
                <button
                  className={`${styles.viewBtn} ${activePreset.groupedByPeriod ? styles.viewBtnActive : ''} ${groupedByPeriodDisabled ? styles.ctrlDisabled : ''}`}
                  onClick={() => { if (!groupedByPeriodDisabled) updatePreset({ groupedByPeriod: !activePreset.groupedByPeriod }) }}
                  disabled={groupedByPeriodDisabled}
                  title={groupedByPeriodDisabled ? `Not available for ${activePreset.xBucket} bucket` : 'Group bars by quarter or month, colour by year'}
                >
                  Grouped
                </button>
              </div>

              {/* Year range */}
              <div className={styles.ctrlGroup}>
                <label className={styles.ctrlLabel}>From</label>
                <input type="number" className={styles.ctrlYear}
                  value={activePreset.filters.yearFrom ?? (+today().slice(0, 4) - 2)}
                  onChange={e => updatePreset({ filters: { ...activePreset.filters, yearFrom: +e.target.value } })}
                  min={2000} max={+today().slice(0, 4) + 5} />
              </div>
              <div className={styles.ctrlGroup}>
                <label className={styles.ctrlLabel}>To</label>
                <input type="number" className={styles.ctrlYear}
                  value={activePreset.filters.yearTo ?? +today().slice(0, 4)}
                  onChange={e => updatePreset({ filters: { ...activePreset.filters, yearTo: +e.target.value } })}
                  min={2000} max={+today().slice(0, 4) + 5} />
              </div>

              <button className={styles.btnSmDanger} onClick={() => handleDeletePreset(activePresetId)} title="Delete this chart preset">Delete chart</button>
            </div>

            {chartData.buckets.length === 0 && !chartData.grouped ? (
              <div className={styles.chartEmpty}>No dividend data in this range. Try refreshing dividend data first.</div>
            ) : (
              <DividendChart data={chartData} preset={activePreset} />
            )}
          </>
        )}

        {!activePreset && (
          <div className={styles.chartEmpty}>No saved charts. Click "+ New" to create one.</div>
        )}
      </section>

      {/* ── Metrics tables ───────────────────────────────────────────────── */}
      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h2 className={styles.sectionTitle}>Metrics</h2>
          <div className={styles.tableControls}>
            <select className={styles.ctrlSelect} value={metricsGrouping} onChange={e => setMetricsGrouping(e.target.value)}>
              <option value="company">By company</option>
              <option value="portfolio">By portfolio</option>
              <option value="country">By country</option>
              <option value="region">By region</option>
              <option value="continent">By continent</option>
            </select>
            <div className={styles.colPickerWrapper}>
              <button className={styles.colPickerBtn} onClick={() => setShowColPicker(p => !p)} title={showColPicker ? 'Close the column picker' : 'Choose which columns to show'}>Columns ▾</button>
              {showColPicker && (
                <div className={styles.colPickerDropdown}>
                  {METRICS_COLUMNS.map(c => (
                    <label key={c.id} className={styles.colPickerItem}>
                      <input type="checkbox" checked={visibleColumns.includes(c.id)}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...visibleColumns, c.id]
                            : visibleColumns.filter(id => id !== c.id)
                          setVisibleColumns(next)
                        }} />
                      {c.label}
                    </label>
                  ))}
                  <button className={styles.colPickerClose} onClick={() => setShowColPicker(false)} title="Close the column picker">Close</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.metricsTableWrap}>
          <table className={styles.tableEl}>
            <thead>
              <tr>
                <th>{metricsGrouping === 'company' ? 'Company' : metricsGrouping.charAt(0).toUpperCase() + metricsGrouping.slice(1)}</th>
                {shownColumns.map(c => (
                  <th key={c.id} className={`${styles.numTh} ${styles.sortableHeader}`} onClick={() => handleSort(c.id)}>
                    {c.label}
                    {sort.col === c.id && <span className={styles.sortArrow}>{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedRows.length === 0 ? (
                <tr><td colSpan={shownColumns.length + 1} className={styles.emptyCell}>No data</td></tr>
              ) : (
                groupedRows.map(row => (
                  <MetricsRow key={row.key} row={row} shownColumns={shownColumns} mainCurrency={mainCurrency} metricsGrouping={metricsGrouping} onNavigate={onNavigate} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ─── MetricsRow ───────────────────────────────────────────────────────────────

function MetricsRow({ row, shownColumns, mainCurrency, metricsGrouping, onNavigate }) {
  const [expanded, setExpanded] = useState(false)
  const isGroup = metricsGrouping !== 'company' && row.subRows?.length > 1

  function renderCell(col) {
    switch (col.id) {
      case 'ttmYield':  return fmtPctPos(row.ttmYield)
      case 'fwdYield':  return fmtPctPos(row.fwdYield)
      case 'last12m':   return fmtMC(row.last12mAmt, mainCurrency)
      case 'next12m':   return fmtMC(row.next12mAmt, mainCurrency)
      case 'cagr3':     return fmtPct(row.cagr3)
      case 'cagr5':     return fmtPct(row.cagr5)
      case 'cagr10':    return fmtPct(row.cagr10)
      default:          return '—'
    }
  }

  return (
    <>
      <tr className={isGroup ? styles.groupRow : ''}>
        <td>
          {isGroup && (
            <button className={styles.expandBtn} onClick={() => setExpanded(p => !p)} title={expanded ? 'Collapse this group' : 'Expand this group to show its companies'}>
              {expanded ? '▾' : '▸'}
            </button>
          )}
          <span className={styles.rowLabel}>
            {metricsGrouping === 'company' ? (
              <>
                <button className={styles.tickerLink} onClick={() => onNavigate?.('stock', { ticker: row.ticker })} title="Open this stock's page">
                  <strong>{row.ticker}</strong>
                </button>
                {' '}{row.label}
              </>
            ) : row.label}
          </span>
        </td>
        {shownColumns.map(c => (
          <td key={c.id} className={styles.numTd}>{renderCell(c)}</td>
        ))}
      </tr>
      {isGroup && expanded && row.subRows.map(sub => (
        <tr key={sub.ticker} className={styles.subRow}>
          <td className={styles.subRowLabel}>{sub.ticker} — {sub.name}</td>
          {shownColumns.map(c => {
            switch (c.id) {
              case 'ttmYield':  return <td key={c.id} className={styles.numTd}>{fmtPctPos(sub.ttmYield)}</td>
              case 'fwdYield':  return <td key={c.id} className={styles.numTd}>{fmtPctPos(sub.fwdYield)}</td>
              case 'last12m':   return <td key={c.id} className={styles.numTd}>{fmtMC(sub.last12mAmt, mainCurrency)}</td>
              case 'next12m':   return <td key={c.id} className={styles.numTd}>{fmtMC(sub.next12mAmt, mainCurrency)}</td>
              case 'cagr3':     return <td key={c.id} className={styles.numTd}>{fmtPct(sub.cagr3)}</td>
              case 'cagr5':     return <td key={c.id} className={styles.numTd}>{fmtPct(sub.cagr5)}</td>
              case 'cagr10':    return <td key={c.id} className={styles.numTd}>{fmtPct(sub.cagr10)}</td>
              default:          return <td key={c.id} className={styles.numTd}>—</td>
            }
          })}
        </tr>
      ))}
    </>
  )
}

// ─── DividendChart ────────────────────────────────────────────────────────────

const CHART_H   = 200
const CHART_PAD = { top: 16, right: 16, bottom: 40, left: 56 }

function DividendChart({ data, preset }) {
  const { buckets, grouped, periods, years } = data
  const containerRef = useRef()
  const [containerW, setContainerW] = useState(600)
  const [tooltip, setTooltip]       = useState(null) // { lines: string[], x, y }

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      setContainerW(entries[0].contentRect.width || 600)
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  const isBar     = preset.chartType !== 'line'
  const isGrouped = !!(preset.groupedByPeriod && grouped && periods && years)
  const todayStr  = today()

  const chartW = containerW - CHART_PAD.left - CHART_PAD.right
  const chartH = CHART_H - CHART_PAD.top - CHART_PAD.bottom

  // ── Tooltip helpers ───────────────────────────────────────────────────────
  function bucketLines(b) {
    const end     = bucketEndDate(b.key, preset.xBucket)
    const isPast  = end < todayStr
    const isFuture = b.key > bucketKey(todayStr, preset.xBucket)
    const isNet   = preset.yType === 'net'
    const paid    = isNet ? b.paidNet    : b.paid
    const toPay   = isNet ? b.toBePaidNet : b.toBePaid
    if (isPast)    return [`Paid: ${fmtAmt(paid)}`]
    if (isFuture)  return [`To be paid: ${fmtAmt(toPay)}`]
    return [`Paid: ${fmtAmt(paid)}`, `To be paid: ${fmtAmt(toPay)}`]
  }

  function cellLines(period, year) {
    const cell = grouped?.[period]?.[year]
    if (!cell) return []
    const xBucket = preset.xBucket
    let startDate, endDate
    if (xBucket === 'quarter') {
      const qi     = PERIOD_LABELS_QUARTER.indexOf(period) + 1
      const firstM = (qi - 1) * 3 + 1
      const lastM  = qi * 3
      startDate = `${year}-${String(firstM).padStart(2,'0')}-01`
      const ld  = new Date(+year, lastM, 0).getDate()
      endDate   = `${year}-${String(lastM).padStart(2,'0')}-${String(ld).padStart(2,'0')}`
    } else {
      const mi = PERIOD_LABELS_MONTH.indexOf(period) + 1
      startDate = `${year}-${String(mi).padStart(2,'0')}-01`
      const ld  = new Date(+year, mi, 0).getDate()
      endDate   = `${year}-${String(mi).padStart(2,'0')}-${String(ld).padStart(2,'0')}`
    }
    const isPast   = endDate < todayStr
    const isFuture = startDate > todayStr
    const isNet    = preset.yType === 'net'
    const paid     = isNet ? cell.paidNet    : cell.paid
    const toPay    = isNet ? cell.toBePaidNet : cell.toBePaid
    const header   = `${period} ${year}`
    if (isPast)    return [header, `Paid: ${fmtAmt(paid)}`]
    if (isFuture)  return [header, `To be paid: ${fmtAmt(toPay)}`]
    return [header, `Paid: ${fmtAmt(paid)}`, `To be paid: ${fmtAmt(toPay)}`]
  }

  function showTooltip(lines, e) {
    const cRect = containerRef.current?.getBoundingClientRect()
    if (!cRect) return
    setTooltip({ lines, x: e.clientX - cRect.left, y: e.clientY - cRect.top })
  }

  // ── Y-axis ticks (shared) ─────────────────────────────────────────────────
  function yTicks(maxVal) {
    return [0, 0.25, 0.5, 0.75, 1].map(f => ({ v: maxVal * f, y: chartH * (1 - f) }))
  }

  function fmtTick(v) {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1).replace('.', ',')}M`
    if (v >= 1000)    return `${(v / 1000).toFixed(0)}K`
    return v.toFixed(0)
  }

  function yPos(v, maxVal) { return chartH - (v / maxVal) * chartH }

  const axes = (
    <>
      <line x1={0} y1={0} x2={0} y2={chartH} stroke="#94a3b8" strokeWidth={1} />
      <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="#94a3b8" strokeWidth={1} />
    </>
  )

  // ── Grouped-by-period rendering ───────────────────────────────────────────
  if (isGrouped) {
    const numPeriods = periods.length
    const numYears   = years.length
    const clusterW   = chartW / numPeriods
    const barW_inner = Math.max(2, (clusterW - 6) / numYears - 1)
    const maxVal = Math.max(
      ...Object.values(grouped).flatMap(yr => Object.values(yr)).map(c => c.declared + c.estimated),
      0.01
    )
    const ticks = yTicks(maxVal)

    return (
      <div className={styles.chartWrap} ref={containerRef} style={{ position: 'relative' }}>
        <svg width={containerW} height={CHART_H} style={{ overflow: 'visible', display: 'block' }}>
          <g transform={`translate(${CHART_PAD.left},${CHART_PAD.top})`}>
            {ticks.map(({ v, y }) => (
              <g key={y}>
                <line x1={0} y1={y} x2={chartW} y2={y} stroke="#e2e8f0" strokeWidth={1} />
                <text x={-6} y={y + 4} textAnchor="end" fontSize={10} fill="#64748b">{fmtTick(v)}</text>
              </g>
            ))}
            {periods.map((period, pi) => {
              const clusterX = pi * clusterW
              return years.map((year, yi) => {
                const cell  = grouped[period]?.[year] ?? { declared: 0, estimated: 0 }
                const total = cell.declared + cell.estimated
                const x     = clusterX + 2 + yi * (barW_inner + 1)
                const declH = (cell.declared / maxVal) * chartH
                const estH  = (cell.estimated / maxVal) * chartH
                const color = CHART_COLORS[yi % CHART_COLORS.length]
                return (
                  <g key={`${period}-${year}`}>
                    {cell.declared > 0 && (
                      <rect x={x} y={yPos(total, maxVal)} width={barW_inner} height={declH} fill={color} opacity={0.9} rx={1} />
                    )}
                    {cell.estimated > 0 && (
                      <rect x={x} y={yPos(cell.estimated, maxVal)} width={barW_inner} height={estH} fill={color} opacity={0.35} rx={1}
                        stroke={color} strokeWidth={1} strokeDasharray="3 2" />
                    )}
                    {total > 0 && (
                      <rect x={x} y={yPos(total, maxVal)} width={barW_inner} height={(total / maxVal) * chartH}
                        fill="transparent" style={{ cursor: 'default' }}
                        onMouseEnter={e => showTooltip(cellLines(period, year), e)}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    )}
                  </g>
                )
              })
            })}
            {periods.map((period, pi) => (
              <text key={period} x={pi * clusterW + clusterW / 2} y={chartH + 14} textAnchor="middle" fontSize={9} fill="#64748b">
                {period}
              </text>
            ))}
            {axes}
          </g>
        </svg>
        {tooltip && (
          <div className={styles.chartTooltip} style={{ left: tooltip.x + 10, top: Math.max(4, tooltip.y - 16) }}>
            {tooltip.lines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
        <div className={styles.chartLegend}>
          {years.map((year, yi) => (
            <span key={year} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: CHART_COLORS[yi % CHART_COLORS.length] }} />
              {year}
            </span>
          ))}
          <span className={styles.legendItem}>
            <span className={styles.legendDash} style={{ borderColor: '#94a3b8' }} />
            Estimated
          </span>
        </div>
      </div>
    )
  }

  // ── Normal bucket rendering ───────────────────────────────────────────────
  if (!buckets.length) return null

  const maxVal = Math.max(...buckets.map(b => b.total), 0.01)
  const barW   = Math.max(4, chartW / buckets.length - 2)
  const ticks  = yTicks(maxVal)
  const todayBucketKey = bucketKey(todayStr, preset.xBucket)

  function xPos(i) { return (i / buckets.length) * chartW + barW / 2 }

  return (
    <div className={styles.chartWrap} ref={containerRef} style={{ position: 'relative' }}>
      <svg width={containerW} height={CHART_H} style={{ overflow: 'visible', display: 'block' }}>
        <g transform={`translate(${CHART_PAD.left},${CHART_PAD.top})`}>
          {ticks.map(({ v, y }) => (
            <g key={y}>
              <line x1={0} y1={y} x2={chartW} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={-6} y={y + 4} textAnchor="end" fontSize={10} fill="#64748b">{fmtTick(v)}</text>
            </g>
          ))}

          {isBar ? (
            buckets.map((b, i) => {
              const x     = xPos(i) - barW / 2
              const declH = (b.declared / maxVal) * chartH
              const estH  = (b.estimated / maxVal) * chartH
              const isFuture = b.key >= todayBucketKey
              return (
                <g key={b.key}>
                  {b.declared > 0 && (
                    <rect x={x} y={yPos(b.total, maxVal)} width={barW} height={declH} fill={CHART_COLORS[0]} opacity={isFuture ? 0.6 : 1} rx={1} />
                  )}
                  {b.estimated > 0 && (
                    <rect x={x} y={yPos(b.estimated, maxVal)} width={barW} height={estH} fill={CHART_COLORS[0]} opacity={0.35} rx={1}
                      stroke={CHART_COLORS[0]} strokeWidth={1} strokeDasharray="3 2" />
                  )}
                  {/* Transparent hover target */}
                  <rect x={x} y={yPos(b.total, maxVal)} width={barW} height={(b.total / maxVal) * chartH}
                    fill="transparent" style={{ cursor: 'default' }}
                    onMouseEnter={e => showTooltip(bucketLines(b), e)}
                    onMouseLeave={() => setTooltip(null)}
                  />
                </g>
              )
            })
          ) : (
            <>
              <polyline
                points={buckets.map((b, i) => `${xPos(i)},${yPos(b.declared, maxVal)}`).join(' ')}
                fill="none" stroke={CHART_COLORS[0]} strokeWidth={2} />
              {buckets.some(b => b.estimated > 0) && (
                <polyline
                  points={buckets.filter(b => b.estimated > 0).map(b => `${xPos(buckets.indexOf(b))},${yPos(b.total, maxVal)}`).join(' ')}
                  fill="none" stroke={CHART_COLORS[0]} strokeWidth={2} strokeDasharray="6 3" opacity={0.6} />
              )}
              {buckets.map((b, i) => (
                <circle key={b.key} cx={xPos(i)} cy={yPos(b.total, maxVal)} r={5} fill="transparent"
                  stroke={CHART_COLORS[0]} strokeWidth={0}
                  onMouseEnter={e => showTooltip(bucketLines(b), e)}
                  onMouseLeave={() => setTooltip(null)}
                  style={{ cursor: 'default' }}
                />
              ))}
              {buckets.map((b, i) => (
                <circle key={`dot-${b.key}`} cx={xPos(i)} cy={yPos(b.total, maxVal)} r={3} fill={CHART_COLORS[0]} style={{ pointerEvents: 'none' }} />
              ))}
            </>
          )}

          {(() => {
            const step = Math.max(1, Math.ceil(buckets.length / 10))
            return buckets.filter((_, i) => i % step === 0 || i === buckets.length - 1).map(b => {
              const i = buckets.indexOf(b)
              return (
                <text key={b.key} x={xPos(i)} y={chartH + 14} textAnchor="middle" fontSize={9} fill="#64748b">
                  {b.key}
                </text>
              )
            })
          })()}
          {axes}
        </g>
      </svg>

      {tooltip && (
        <div className={styles.chartTooltip} style={{ left: tooltip.x + 10, top: Math.max(4, tooltip.y - 16) }}>
          {tooltip.lines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      <div className={styles.chartLegend}>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: CHART_COLORS[0] }} />
          Declared
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDash} style={{ borderColor: CHART_COLORS[0] }} />
          Estimated
        </span>
      </div>
    </div>
  )
}
