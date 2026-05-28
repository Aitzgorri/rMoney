import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { getInvestingAccounts } from '../data/investingAccounts'
import { getPositions } from '../data/stockTransactions'
import {
  getApiDividendHistoryForTicker, refreshApiDividendHistory, isStaleForTicker, getRefreshMeta,
} from '../data/apiDividendHistory'
import { getDividendsByTicker, resolveDividendTaxPercent, getPendingConfirmationDividends, confirmDividend, deleteDividend, updateDividend, computeDividendDerived } from '../data/dividends'
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
import { fmtAmt } from '../utils/format'
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
  { id: 'ttmYield',    label: 'TTM yield',            numeric: true },
  { id: 'fwdYield',    label: 'Forward yield',         numeric: true },
  { id: 'last12m',     label: 'Last 12m amount',       numeric: true },
  { id: 'next12m',     label: 'Next 12m amount',       numeric: true },
  { id: 'cagr3',       label: 'CAGR 3y',               numeric: true },
  { id: 'cagr5',       label: 'CAGR 5y',               numeric: true },
  { id: 'cagr10',      label: 'CAGR 10y',              numeric: true },
]

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
  return dateStr.slice(0, 4) // year
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

// Compact number for calendar cell: e.g. 0.83, 12.34, 1.2K
function fmtCompact(n) {
  if (n == null || !isFinite(n)) return '—'
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`
  if (Math.abs(n) >= 10)   return n.toFixed(2)
  return n.toFixed(4).replace(/\.?0+$/, '') || '0'
}

// Merge apiDividendHistory + user dividends for a ticker; user records win on (ticker, exDate).
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
        exDate:     d.exDividendDate,
        payDate:    d.payoutDate,
        perShare:   d.dividendPerShare,
        currency:   d.currency,
        type:       d.type ?? 'regular',
        state:      (d.payoutDate ?? d.exDividendDate) < now ? 'paid' : 'declared',
        source:     'user',
        shareCount: d.shareCount,
      })
    }
  }
  return [...merged.values()].sort((a, b) => b.exDate.localeCompare(a.exDate))
}

// Compute projected future payouts from merged history (regular only).
// Returns events with state: 'estimated'.
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

  // Average ex-div → pay-date gap in days, derived from past records with both dates.
  // Falls back to 14 days when history is sparse or inconsistent.
  const exPayGaps = regular
    .filter(r => r.exDate && r.payDate)
    .map(r => (new Date(r.payDate).getTime() - new Date(r.exDate).getTime()) / 86400000)
    .filter(g => g > 0 && g < 90)
  const avgExPayGapDays = exPayGaps.length
    ? Math.round(exPayGaps.reduce((s, g) => s + g, 0) / exPayGaps.length)
    : 14

  const lastReg  = regular[0] // most recent
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
        type:  'regular',
        state: 'estimated',
        source: 'projection',
      })
    }
  }
  return projections
}

// Compute TTM per-share sum for a ticker from merged records (past 12 months by exDate).
function computeTtmPerShare(merged) {
  const now = today()
  const cutoff = shiftYear(now, -1)
  return merged
    .filter(r => r.exDate >= cutoff && r.exDate <= now)
    .reduce((s, r) => s + (r.perShare ?? 0), 0)
}

// Compute forward per-share (annualised last regular payout × frequency).
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

// Compute CAGR over N years from apiDividendHistory only (per-share, regular only).
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

// Build dividend records — one per (ticker, exDate). Each record has both ex-div and pay dates.
// Shape: { ticker, name, exDate, payDate, perShare, currency, dividendType, state, shares, taxPct }
function buildDividendRecords(heldTickers, dataByTicker, heldData, taxPctByTicker) {
  const records = []
  for (const ticker of heldTickers) {
    const { merged = [], projected = [], profile } = dataByTicker[ticker] ?? {}
    const name    = profile?.name ?? ticker
    const shares  = heldData?.[ticker]?.shares ?? 0
    const taxPct  = (taxPctByTicker?.[ticker] ?? 0) / 100

    for (const r of merged) {
      records.push({
        ticker, name,
        exDate: r.exDate, payDate: r.payDate,
        perShare: r.perShare, currency: r.currency,
        dividendType: r.type ?? 'regular',
        state: r.state ?? 'declared',
        shares, taxPct,
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
      })
    }
  }
  return records
}

// Expand records into per-date markers for the month grid.
// Each record produces up to 2 events: one on exDate, one on payDate.
function recordsToEvents(records) {
  const events = []
  for (const r of records) {
    if (r.exDate)  events.push({ ...r, date: r.exDate,  kind: 'exdiv' })
    if (r.payDate) events.push({ ...r, date: r.payDate, kind: 'pay'   })
  }
  return events
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function DividendPage({ initialTab }) {
  const mainCurrency = getMainCurrency()

  // ── 31a: Held tickers (scope) ─────────────────────────────────────────────
  const [accounts]     = useState(() => getInvestingAccounts())
  const [portfolios]   = useState(() => getPortfolios())
  const [assignments]  = useState(() => getAllPortfolioAssignments())

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

  const heldTickers = useMemo(
    () => Object.keys(heldData).sort().filter(t => getStockProfile(t)?.paysDividends !== false),
    [heldData]
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

  // ── Refresh button ────────────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false)
  const [refreshStatus, setRefreshStatus] = useState({}) // ticker → 'ok'|'error'|'loading'
  const [resetState, setResetState] = useState('idle')

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

  // ── Calendar state (31b/31c) ──────────────────────────────────────────────
  const [calView,   setCalView]   = useState(() => localStorage.getItem('rmoney_dividend_calendar_view')   ?? 'table')
  const [calFilter, setCalFilter] = useState(() => localStorage.getItem('rmoney_dividend_calendar_filter') ?? 'pay-only')
  const [calMonth,  setCalMonth]  = useState(() => {
    const stored = localStorage.getItem('rmoney_dividend_calendar_month')
    return stored ?? today().slice(0, 7)
  })

  function setCalViewP(v) { setCalView(v); localStorage.setItem('rmoney_dividend_calendar_view', v) }
  function setCalFilterP(v) { setCalFilter(v); localStorage.setItem('rmoney_dividend_calendar_filter', v) }
  function setCalMonthP(v) { setCalMonth(v); localStorage.setItem('rmoney_dividend_calendar_month', v) }

  // ── Metrics state (31d/31e) ───────────────────────────────────────────────
  const [metricsGrouping, setMetricsGroupingRaw] = useState(
    () => localStorage.getItem('rmoney_dividend_metrics_grouping') ?? 'company'
  )
  function setMetricsGrouping(v) {
    setMetricsGroupingRaw(v)
    localStorage.setItem('rmoney_dividend_metrics_grouping', v)
  }

  const [visibleColumns, setVisibleColumnsRaw] = useState(() => {
    try {
      const stored = localStorage.getItem('rmoney_dividend_metrics_columns')
      return stored ? JSON.parse(stored) : METRICS_COLUMNS.map(c => c.id)
    } catch { return METRICS_COLUMNS.map(c => c.id) }
  })
  function setVisibleColumns(cols) {
    setVisibleColumnsRaw(cols)
    localStorage.setItem('rmoney_dividend_metrics_columns', JSON.stringify(cols))
  }

  const [sortByGrouping, setSortByGroupingRaw] = useState(() => {
    try {
      const stored = localStorage.getItem('rmoney_dividend_metrics_sort')
      return stored ? JSON.parse(stored) : {}
    } catch { return {} }
  })
  function setSortForGrouping(grouping, col, dir) {
    setSortByGroupingRaw(prev => {
      const next = { ...prev, [grouping]: { col, dir } }
      localStorage.setItem('rmoney_dividend_metrics_sort', JSON.stringify(next))
      return next
    })
  }

  // ── Tax percent per ticker (for net totals in calendar) ──────────────────
  const taxPctByTicker = useMemo(() => {
    const result = {}
    for (const ticker of heldTickers) result[ticker] = resolveDividendTaxPercent(ticker)
    return result
  }, [heldTickers])

  // ── Calendar records + events (memoised) ─────────────────────────────────
  // Records: one per (ticker, exDate). Used by table view.
  // Events: each record expanded into up to 2 markers (one per date). Used by month grid.
  const calendarRecords = useMemo(
    () => buildDividendRecords(heldTickers, dataByTicker, heldData, taxPctByTicker),
    [heldTickers, dataByTicker, heldData, taxPctByTicker]
  )

  const calendarEvents = useMemo(
    () => recordsToEvents(calendarRecords),
    [calendarRecords]
  )

  // ── Computed metrics rows (memoised) ─────────────────────────────────────
  const metricsRows = useMemo(() => {
    if (!fxReady) return []
    const rows = []
    for (const ticker of heldTickers) {
      const d = dataByTicker[ticker]
      if (!d) continue
      const { apiHistory, userDividends, profile, merged } = d
      const shares        = heldData[ticker]?.shares ?? 0
      const currency      = heldData[ticker]?.accounts[0]?.currency ?? 'USD'
      const latestPrice   = priceByTicker[ticker]?.price ?? null
      const ttmPerShare   = computeTtmPerShare(merged)
      const fwdData       = computeForwardPerShare(merged, apiHistory, userDividends, profile)

      // amounts in main currency
      const fxRate = latestPrice ? (convertToMain(latestPrice, currency, mainCurrency) / latestPrice) : 1
      const marketValueMain = latestPrice ? latestPrice * shares * fxRate : null
      const ttmYield  = latestPrice && ttmPerShare > 0 ? ttmPerShare / latestPrice : null
      const fwdYield  = latestPrice && fwdData ? fwdData.annualised / latestPrice : null

      // Last 12m amount: merged records in last 12m × shares → main currency
      const now = today(); const cutoff12m = shiftYear(now, -1)
      const last12mAmt = merged
        .filter(r => r.exDate >= cutoff12m && r.exDate <= now)
        .reduce((s, r) => s + (r.perShare ?? 0) * shares * fxRate, 0)

      // Next 12m: declared future + estimated next year
      const cutoffFuture = shiftYear(now, 1)
      const declaredFuture = merged.filter(r => r.exDate > now && r.exDate <= cutoffFuture && r.state === 'declared')
      const estimatedFuture = d.projected.filter(r => {
        const ref = r.payDate ?? r.exDate
        return ref > now && ref <= cutoffFuture
      })
      const allFuture = [...declaredFuture, ...estimatedFuture]
      const next12mAmt = allFuture.reduce((s, r) => s + (r.perShare ?? 0) * shares * fxRate, 0)

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
  }, [heldTickers, dataByTicker, heldData, priceByTicker, fxReady, mainCurrency, assignments])

  // ─────────────────────────────────────────────────────────────────────────
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
      {/* ── Page header ────────────────────────────────────────────────────── */}
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
          <button className={styles.addDivBtn} onClick={() => setShowAddDiv(true)}>
            + Add dividend
          </button>
          <button
            className={styles.refreshBtn}
            onClick={handleRefreshAll}
            disabled={refreshing}
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

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div className={styles.tabBar}>
        <button className={`${styles.tabBtn} ${activeTab === 'calendar' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('calendar')}>Calendar</button>
        <button className={`${styles.tabBtn} ${activeTab === 'metrics'  ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('metrics')}>Metrics</button>
        <button className={`${styles.tabBtn} ${activeTab === 'pending'  ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('pending')}>
          Pending
          {pendingRecords.length > 0 && <span className={styles.pendingBadge}>{pendingRecords.length}</span>}
        </button>
      </div>

      {/* ── Add dividend overlay ───────────────────────────────────────────── */}
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

      {/* ── Calendar tab ───────────────────────────────────────────────────── */}
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
        />
      )}

      {/* ── Metrics tab ────────────────────────────────────────────────────── */}
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
        />
      )}

      {/* ── Pending tab ────────────────────────────────────────────────────── */}
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
  const [editId, setEditId] = useState(null)
  const [editDraft, setEditDraft] = useState({})

  const accountById = useMemo(() => {
    const map = {}
    for (const a of accounts) map[a.id] = a
    return map
  }, [accounts])

  function handleConfirm(id) {
    confirmDividend(id)
    onRefresh()
  }

  function handleConfirmAll() {
    for (const r of records) confirmDividend(r.id)
    onRefresh()
  }

  function handleDelete(id) {
    deleteDividend(id)
    onRefresh()
  }

  function handleEditStart(r) {
    setEditId(r.id)
    setEditDraft({ dividendPerShare: r.dividendPerShare, taxPercent: r.taxPercent })
  }

  function handleEditSave(r) {
    updateDividend(r.id, { dividendPerShare: editDraft.dividendPerShare, taxPercent: editDraft.taxPercent, type: r.type })
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
        <button className={styles.confirmAllBtn} onClick={handleConfirmAll}>Confirm all</button>
      </div>
      <div className={styles.pendingTableWrap}>
        <table className={styles.tableEl}>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Account</th>
              <th>Ex-div</th>
              <th>Pay date</th>
              <th className={styles.numTh}>Per share</th>
              <th className={styles.numTh}>Shares</th>
              <th className={styles.numTh}>Tax %</th>
              <th className={styles.numTh}>Net total</th>
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => {
              const { netTotal } = computeDividendDerived(r)
              const acct = accountById[r.investingAccountId]
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
                        <input
                          type="number" step="0.0001" min="0"
                          className={styles.editInput}
                          value={editDraft.dividendPerShare}
                          onChange={e => setEditDraft(prev => ({ ...prev, dividendPerShare: e.target.value }))}
                        />
                      </td>
                      <td className={styles.numTd}>{r.shareCount}</td>
                      <td className={styles.numTd}>
                        <input
                          type="number" step="0.01" min="0" max="100"
                          className={styles.editInput}
                          value={editDraft.taxPercent}
                          onChange={e => setEditDraft(prev => ({ ...prev, taxPercent: e.target.value }))}
                        />
                      </td>
                      <td className={styles.numTd}>—</td>
                    </>
                  ) : (
                    <>
                      <td className={styles.numTd}>{r.dividendPerShare.toFixed(4)} {r.currency}</td>
                      <td className={styles.numTd}>{r.shareCount}</td>
                      <td className={styles.numTd}>{r.taxPercent}%</td>
                      <td className={styles.numTd}>{netTotal.toFixed(2)} {r.currency}</td>
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
                        <button className={styles.confirmBtn} onClick={() => handleEditSave(r)}>Save</button>
                        <button className={styles.skipBtn} onClick={() => setEditId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className={styles.confirmBtn} onClick={() => handleConfirm(r.id)}>Confirm</button>
                        <button className={styles.editBtn} onClick={() => handleEditStart(r)}>Edit</button>
                        <button className={styles.skipBtn} onClick={() => handleDelete(r.id)}>Delete</button>
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
    if (s === 'ok') return false
    if (s === 'loading') return false
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

function CalendarTab({ events, records, calView, setCalView, calFilter, setCalFilter, calMonth, setCalMonth, dataByTicker }) {
  const [popupDay, setPopupDay] = useState(null) // YYYY-MM-DD

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
  function goToday() {
    setCalMonth(today().slice(0, 7))
  }

  // Filter events by selected month and filter mode
  const filteredEvents = useMemo(() => {
    let ev = events.filter(e => e.date.startsWith(calMonth))
    if (calFilter === 'pay-only') ev = ev.filter(e => e.kind === 'pay')
    return ev
  }, [events, calMonth, calFilter])

  // Group filtered events by day
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
      {/* Controls row */}
      <div className={styles.calControls}>
        {/* View toggle (31c) */}
        <div className={styles.viewToggle}>
          <button className={`${styles.viewBtn} ${calView === 'month' ? styles.viewBtnActive : ''}`} onClick={() => setCalView('month')}>Month</button>
          <button className={`${styles.viewBtn} ${calView === 'table' ? styles.viewBtnActive : ''}`} onClick={() => setCalView('table')}>Table</button>
        </div>

        {/* Month nav (31b) — only shown in month view */}
        {calView === 'month' && (
          <div className={styles.monthNav}>
            <button className={styles.navBtn} onClick={prevMonth}>‹</button>
            <span className={styles.monthLabel}>{monthLabel}</span>
            <button className={styles.navBtn} onClick={nextMonth}>›</button>
            <button className={styles.navBtnSm} onClick={goToday}>Today</button>
          </div>
        )}

        {/* Filter toggle — only relevant for month view (which markers to render) */}
        {calView === 'month' && (
          <div className={styles.filterToggle}>
            <button className={`${styles.viewBtn} ${calFilter === 'both'     ? styles.viewBtnActive : ''}`} onClick={() => setCalFilter('both')}>Ex-div + Pay</button>
            <button className={`${styles.viewBtn} ${calFilter === 'pay-only' ? styles.viewBtnActive : ''}`} onClick={() => setCalFilter('pay-only')}>Pay only</button>
          </div>
        )}
      </div>

      {calView === 'month' ? (
        <MonthGrid
          calMonth={calMonth}
          eventsByDay={eventsByDay}
          popupDay={popupDay}
          setPopupDay={setPopupDay}
        />
      ) : (
        <CalendarTable
          records={records}
          calMonth={calMonth}
        />
      )}
    </div>
  )
}

// ─── MonthGrid (31b) ──────────────────────────────────────────────────────────

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function MonthGrid({ calMonth, eventsByDay, popupDay, setPopupDay }) {
  const [yr, mo] = calMonth.split('-').map(Number)
  const firstDay  = new Date(yr, mo - 1, 1)
  const daysInMonth = new Date(yr, mo, 0).getDate()
  // Monday-based: 0=Mon … 6=Sun
  const startOffset = (firstDay.getDay() + 6) % 7

  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${yr}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className={styles.monthGrid}>
      {/* Weekday headers */}
      {WEEKDAYS.map(w => (
        <div key={w} className={styles.weekdayHeader}>{w}</div>
      ))}
      {/* Day cells */}
      {cells.map((dateStr, i) => {
        if (!dateStr) return <div key={`empty-${i}`} className={styles.dayCell} />
        const dayEvents = eventsByDay[dateStr] ?? []
        const isToday   = dateStr === today()
        const hasPop    = popupDay === dateStr

        const maxInline = 2
        const overflow  = dayEvents.length > maxInline ? dayEvents.length - maxInline : 0

        return (
          <div
            key={dateStr}
            className={`${styles.dayCell} ${isToday ? styles.dayCellToday : ''}`}
          >
            <span className={styles.dayNum}>{+dateStr.slice(8)}</span>
            <div className={styles.dotList}>
              {dayEvents.slice(0, overflow ? maxInline : dayEvents.length).map((e, j) => {
                const totalGross = (e.perShare ?? 0) * (e.shares ?? 0)
                const totalNet   = totalGross * (1 - (e.taxPct ?? 0))
                return (
                  <div key={j} className={styles.dotRow}>
                    <span
                      className={`${styles.dot} ${e.kind === 'pay' ? styles.dotGreen : styles.dotBlue} ${e.state === 'estimated' ? styles.dotDashed : ''}`}
                    />
                    <span className={styles.dotTicker}>{e.ticker}</span>
                    <span className={styles.dotNum} title="Per share (gross)">{fmtCompact(e.perShare)}</span>
                    <span className={styles.dotNum} title="Total gross">{fmtCompact(totalGross)}</span>
                    <span className={styles.dotNum} title="Total net">{fmtCompact(totalNet)}</span>
                  </div>
                )
              })}
              {overflow > 0 && (
                <button
                  className={styles.overflowLink}
                  onClick={() => setPopupDay(hasPop ? null : dateStr)}
                >
                  +{overflow} more
                </button>
              )}
            </div>
            {hasPop && (
              <DayPopup events={dayEvents} onClose={() => setPopupDay(null)} />
            )}
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
      <button className={styles.popupClose} onClick={onClose}>×</button>
      {events.map((e, i) => (
        <div key={i} className={styles.popupRow}>
          <span className={`${styles.dot} ${e.kind === 'pay' ? styles.dotGreen : styles.dotBlue} ${e.state === 'estimated' ? styles.dotDashed : ''}`} />
          <span className={styles.popupTicker}>{e.ticker}</span>
          <span className={styles.popupName}>{e.name}</span>
          <span className={styles.popupKind}>{e.kind === 'pay' ? 'Pay' : 'Ex-div'}</span>
          {e.perShare != null && <span className={styles.popupAmt}>{e.perShare.toFixed(4)} {e.currency}/sh</span>}
          <span className={`${styles.popupState} ${e.state === 'estimated' ? styles.stateEstimated : ''}`}>{e.state}</span>
        </div>
      ))}
    </div>
  )
}

// ─── CalendarTable (31c) ──────────────────────────────────────────────────────

const TABLE_CHUNK_MONTHS = 3

function CalendarTable({ records, calMonth }) {
  const [monthsShown, setMonthsShown] = useState(TABLE_CHUNK_MONTHS)
  const [sort, setSort] = useState({ col: 'exDate', dir: 'asc' })
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

  const now = today()

  // Upcoming records: keep when the latest of (exDate, payDate) is still in the future.
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

  // Cutoff: now + monthsShown months. Compared against exDate (the row's primary date).
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
          </tr>
        </thead>
        <tbody>
          {visibleRecords.length === 0 ? (
            <tr><td colSpan={7} className={styles.emptyCell}>No upcoming dividends in this period</td></tr>
          ) : (
            visibleRecords.map((r, i) => (
              <tr key={i} className={r.state === 'estimated' ? styles.estimatedRow : ''}>
                <td>{r.exDate ?? '—'}</td>
                <td>{r.payDate ?? '—'}</td>
                <td className={styles.tickerCell}>{r.ticker}</td>
                <td>{r.name}</td>
                <td className={styles.numTd}>{r.perShare != null ? `${r.perShare.toFixed(4)} ${r.currency}` : '—'}</td>
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
              </tr>
            ))
          )}
        </tbody>
      </table>
      {hasMore && <div ref={loadMoreRef} className={styles.loadMoreSentinel} />}
      {hasMore && (
        <button className={styles.loadMoreBtn} onClick={() => setMonthsShown(prev => prev + TABLE_CHUNK_MONTHS)}>
          Load more months
        </button>
      )}
    </div>
  )
}

// ─── MetricsTab (31d + 31e) ───────────────────────────────────────────────────

function MetricsTab({
  heldTickers, dataByTicker, heldData, metricsRows, metricsGrouping, setMetricsGrouping,
  visibleColumns, setVisibleColumns, sortByGrouping, setSortForGrouping, mainCurrency,
  portfolios, assignments,
}) {
  // Chart state (31d)
  const [chartPresets,   setChartPresets]   = useState(() => getDividendChartPresets())
  const [activePresetId, setActivePresetId] = useState(() => getDividendChartPresets()[0]?.id ?? null)
  const [editPresetId,   setEditPresetId]   = useState(null)
  const [presetNameDraft, setPresetNameDraft] = useState('')
  const [showColPicker,  setShowColPicker]  = useState(false)

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

  // Build chart data from held tickers + presets filters
  const chartData = useMemo(() => {
    if (!activePreset) return { buckets: [], datasets: [] }
    const { xBucket, yType, filters } = activePreset

    const now = today()
    const yearFrom = filters.yearFrom ?? (+now.slice(0, 4) - 2)
    const yearTo   = filters.yearTo   ?? (+now.slice(0, 4))

    // Collect all dividend events for held tickers (past + declared future + estimated)
    const allEvents = [] // { date, perShare, currency, state, ticker }

    for (const ticker of heldTickers) {
      const d = dataByTicker[ticker]
      if (!d) continue
      const { merged, projected } = d
      const shares  = heldData[ticker]?.shares ?? 0
      const currency = heldData[ticker]?.accounts[0]?.currency ?? 'USD'
      const fxRate = 1 // simplified: amounts already in main currency would need real FX

      const grossPerEvent = (r) => (r.perShare ?? 0) * shares
      const taxPct = 0 // for gross; net would need per-record tax, simplified here

      for (const r of merged) {
        if (r.exDate < `${yearFrom}-01-01` || r.exDate > `${yearTo}-12-31`) continue
        if (filters.companies?.length && !filters.companies.includes(ticker)) continue
        allEvents.push({ date: r.payDate ?? r.exDate, amount: grossPerEvent(r), state: r.state, ticker, currency })
      }
      for (const r of projected) {
        const ref = r.payDate ?? r.exDate
        if (ref < `${yearFrom}-01-01` || ref > `${yearTo}-12-31`) continue
        if (filters.companies?.length && !filters.companies.includes(ticker)) continue
        allEvents.push({ date: ref, amount: grossPerEvent(r), state: 'estimated', ticker, currency })
      }
    }

    // Group by xBucket
    const bucketMap = new Map()
    for (const ev of allEvents) {
      const key = bucketKey(ev.date, xBucket)
      if (!bucketMap.has(key)) bucketMap.set(key, { declared: 0, estimated: 0 })
      const bucket = bucketMap.get(key)
      if (ev.state === 'estimated') bucket.estimated += ev.amount
      else bucket.declared += ev.amount
    }

    const buckets = [...bucketMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, val]) => ({ key, ...val, total: val.declared + val.estimated }))

    return { buckets, datasets: [{ label: 'All holdings', color: CHART_COLORS[0] }] }
  }, [activePreset, heldTickers, dataByTicker, heldData])

  // ── Metrics tables (31e) ───────────────────────────────────────────────────
  const sort = sortByGrouping[metricsGrouping] ?? { col: 'last12m', dir: 'desc' }

  function handleSort(col) {
    const dir = sort.col === col && sort.dir === 'desc' ? 'asc' : 'desc'
    setSortForGrouping(metricsGrouping, col, dir)
  }

  // Build grouped rows
  const groupedRows = useMemo(() => {
    const rows = [...metricsRows]
    // Apply grouping key
    const getKey = (r) => {
      if (metricsGrouping === 'company')   return r.ticker
      if (metricsGrouping === 'portfolio') {
        const port = portfolios.find(p => p.id === r.portfolio)
        return port?.name ?? 'Unassigned'
      }
      if (metricsGrouping === 'country')   return r.country ?? 'Unknown'
      if (metricsGrouping === 'region')    return r.region   ?? 'Unknown'
      if (metricsGrouping === 'continent') return r.continent ?? 'Unknown'
      return r.ticker
    }
    const getLabel = (r) => metricsGrouping === 'company' ? r.name : getKey(r)

    if (metricsGrouping === 'company') {
      // Each row is its own group
      const sorted = applySortToRows(rows, sort)
      return sorted.map(r => ({
        key: r.ticker, label: r.name, ticker: r.ticker,
        ttmYield: r.ttmYield, fwdYield: r.fwdYield,
        last12mAmt: r.last12mAmt, next12mAmt: r.next12mAmt,
        cagr3: r.cagr3, cagr5: r.cagr5, cagr10: r.cagr10,
        marketValueMain: r.marketValueMain,
        subRows: [],
      }))
    }

    // Group and aggregate
    const groups = new Map()
    for (const r of rows) {
      const key = getKey(r)
      if (!groups.has(key)) groups.set(key, { key, label: getLabel(r), rows: [] })
      groups.get(key).rows.push(r)
    }

    const aggGroups = [...groups.values()].map(({ key, label, rows: gRows }) => {
      const totalMV = gRows.reduce((s, r) => s + (r.marketValueMain ?? 0), 0)
      const wmAvg = (field) => {
        if (!totalMV) return null
        const weighted = gRows.reduce((s, r) => s + (r[field] ?? 0) * (r.marketValueMain ?? 0), 0)
        return weighted / totalMV
      }
      return {
        key, label,
        ttmYield:  wmAvg('ttmYield'),
        fwdYield:  wmAvg('fwdYield'),
        last12mAmt: gRows.reduce((s, r) => s + (r.last12mAmt ?? 0), 0),
        next12mAmt: gRows.reduce((s, r) => s + (r.next12mAmt ?? 0), 0),
        cagr3:  wmAvg('cagr3'),
        cagr5:  wmAvg('cagr5'),
        cagr10: wmAvg('cagr10'),
        marketValueMain: totalMV,
        subRows: gRows,
      }
    })

    return applySortToRows(aggGroups, sort)
  }, [metricsRows, metricsGrouping, sort, portfolios])

  function applySortToRows(rows, sort) {
    const { col, dir } = sort
    const fieldMap = {
      ttmYield: 'ttmYield', fwdYield: 'fwdYield',
      last12m: 'last12mAmt', next12m: 'next12mAmt',
      cagr3: 'cagr3', cagr5: 'cagr5', cagr10: 'cagr10',
    }
    const field = fieldMap[col] ?? 'last12mAmt'
    return [...rows].sort((a, b) => {
      const av = a[field] ?? (dir === 'asc' ? Infinity : -Infinity)
      const bv = b[field] ?? (dir === 'asc' ? Infinity : -Infinity)
      return dir === 'asc' ? av - bv : bv - av
    })
  }

  const shownColumns = METRICS_COLUMNS.filter(c => visibleColumns.includes(c.id))

  return (
    <div className={styles.metricsTab}>
      {/* ── 31d: Payout chart ───────────────────────────────────────────────── */}
      <section className={styles.chartSection}>
        <div className={styles.chartHeader}>
          <h2 className={styles.sectionTitle}>Payout chart</h2>
          <div className={styles.presetRow}>
            {chartPresets.map(p => (
              <button
                key={p.id}
                className={`${styles.presetBtn} ${p.id === activePresetId ? styles.presetBtnActive : ''}`}
                onClick={() => setActivePresetId(p.id)}
              >
                {p.name}
              </button>
            ))}
            <button className={styles.presetBtnAdd} onClick={handleCreatePreset}>+ New</button>
          </div>
        </div>

        {activePreset && (
          <>
            <div className={styles.chartControls}>
              {/* Preset name */}
              <div className={styles.ctrlGroup}>
                <label className={styles.ctrlLabel}>Name</label>
                {editPresetId === activePresetId ? (
                  <input
                    className={styles.presetNameInput}
                    value={presetNameDraft}
                    onChange={e => setPresetNameDraft(e.target.value)}
                    onBlur={() => {
                      updatePreset({ name: presetNameDraft || activePreset.name })
                      setEditPresetId(null)
                    }}
                    autoFocus
                  />
                ) : (
                  <button className={styles.presetNameBtn} onClick={() => { setPresetNameDraft(activePreset.name); setEditPresetId(activePresetId) }}>
                    {activePreset.name} ✎
                  </button>
                )}
              </div>

              {/* X bucket */}
              <div className={styles.ctrlGroup}>
                <label className={styles.ctrlLabel}>X axis</label>
                <select className={styles.ctrlSelect} value={activePreset.xBucket} onChange={e => updatePreset({ xBucket: e.target.value })}>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="quarter">Quarter</option>
                  <option value="year">Year</option>
                </select>
              </div>

              {/* Y type */}
              <div className={styles.ctrlGroup}>
                <label className={styles.ctrlLabel}>Y axis</label>
                <select className={styles.ctrlSelect} value={activePreset.yType} onChange={e => updatePreset({ yType: e.target.value })}>
                  <option value="gross">Gross</option>
                  <option value="net">Net</option>
                </select>
              </div>

              {/* Chart type */}
              <div className={styles.ctrlGroup}>
                <label className={styles.ctrlLabel}>Chart</label>
                <select className={styles.ctrlSelect} value={activePreset.chartType} onChange={e => updatePreset({ chartType: e.target.value })}>
                  <option value="bar">Bar</option>
                  <option value="line">Line</option>
                </select>
              </div>

              {/* Year range */}
              <div className={styles.ctrlGroup}>
                <label className={styles.ctrlLabel}>From</label>
                <input
                  type="number" className={styles.ctrlYear}
                  value={activePreset.filters.yearFrom ?? (+today().slice(0, 4) - 2)}
                  onChange={e => updatePreset({ filters: { ...activePreset.filters, yearFrom: +e.target.value } })}
                  min={2000} max={+today().slice(0, 4) + 5}
                />
              </div>
              <div className={styles.ctrlGroup}>
                <label className={styles.ctrlLabel}>To</label>
                <input
                  type="number" className={styles.ctrlYear}
                  value={activePreset.filters.yearTo ?? +today().slice(0, 4)}
                  onChange={e => updatePreset({ filters: { ...activePreset.filters, yearTo: +e.target.value } })}
                  min={2000} max={+today().slice(0, 4) + 5}
                />
              </div>

              <button className={styles.btnSmDanger} onClick={() => handleDeletePreset(activePresetId)}>Delete chart</button>
            </div>

            {chartData.buckets.length === 0 ? (
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

      {/* ── 31e: Metrics tables ─────────────────────────────────────────────── */}
      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h2 className={styles.sectionTitle}>Metrics</h2>
          <div className={styles.tableControls}>
            {/* Group selector */}
            <select className={styles.ctrlSelect} value={metricsGrouping} onChange={e => setMetricsGrouping(e.target.value)}>
              <option value="company">By company</option>
              <option value="portfolio">By portfolio</option>
              <option value="country">By country</option>
              <option value="region">By region</option>
              <option value="continent">By continent</option>
            </select>

            {/* Column picker */}
            <div className={styles.colPickerWrapper}>
              <button className={styles.colPickerBtn} onClick={() => setShowColPicker(p => !p)}>
                Columns ▾
              </button>
              {showColPicker && (
                <div className={styles.colPickerDropdown}>
                  {METRICS_COLUMNS.map(c => (
                    <label key={c.id} className={styles.colPickerItem}>
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(c.id)}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...visibleColumns, c.id]
                            : visibleColumns.filter(id => id !== c.id)
                          setVisibleColumns(next)
                        }}
                      />
                      {c.label}
                    </label>
                  ))}
                  <button className={styles.colPickerClose} onClick={() => setShowColPicker(false)}>Close</button>
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
                  <th
                    key={c.id}
                    className={`${styles.numTh} ${styles.sortableHeader}`}
                    onClick={() => handleSort(c.id)}
                  >
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
                  <MetricsRow key={row.key} row={row} shownColumns={shownColumns} mainCurrency={mainCurrency} metricsGrouping={metricsGrouping} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function MetricsRow({ row, shownColumns, mainCurrency, metricsGrouping }) {
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
            <button className={styles.expandBtn} onClick={() => setExpanded(p => !p)}>
              {expanded ? '▾' : '▸'}
            </button>
          )}
          <span className={styles.rowLabel}>
            {metricsGrouping === 'company' ? (
              <><strong>{row.ticker}</strong> {row.label}</>
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
            const v = {
              ttmYield: sub.ttmYield, fwdYield: sub.fwdYield,
              last12m: sub.last12mAmt, next12m: sub.next12mAmt,
              cagr3: sub.cagr3, cagr5: sub.cagr5, cagr10: sub.cagr10,
            }
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

// ─── DividendChart (31d — custom SVG) ────────────────────────────────────────

const CHART_H = 200
const CHART_PAD = { top: 16, right: 16, bottom: 40, left: 56 }

function DividendChart({ data, preset }) {
  const { buckets, datasets } = data
  const containerRef = useRef()
  const [containerW, setContainerW] = useState(600)

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      setContainerW(entries[0].contentRect.width || 600)
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  if (!buckets.length) return null

  const chartW = containerW - CHART_PAD.left - CHART_PAD.right
  const chartH = CHART_H - CHART_PAD.top - CHART_PAD.bottom
  const maxVal  = Math.max(...buckets.map(b => b.total), 0.01)
  const barW    = Math.max(4, chartW / buckets.length - 2)

  function xPos(i) { return (i / buckets.length) * chartW + barW / 2 }
  function yPos(v) { return chartH - (v / maxVal) * chartH }

  const isBar = preset.chartType !== 'line'
  const todayKey = bucketKey(today(), preset.xBucket)

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ v: maxVal * f, y: chartH * (1 - f) }))

  function fmtTick(v) {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`
    if (v >= 1000)    return `${(v / 1000).toFixed(0)}K`
    return v.toFixed(0)
  }

  return (
    <div className={styles.chartWrap} ref={containerRef}>
      <svg
        width={containerW}
        height={CHART_H}
        style={{ overflow: 'visible', display: 'block' }}
      >
        <g transform={`translate(${CHART_PAD.left},${CHART_PAD.top})`}>
          {/* Y grid + ticks */}
          {yTicks.map(({ v, y }) => (
            <g key={y}>
              <line x1={0} y1={y} x2={chartW} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={-6} y={y + 4} textAnchor="end" fontSize={10} fill="#64748b">{fmtTick(v)}</text>
            </g>
          ))}

          {isBar ? (
            // Bar chart: declared solid, estimated striped
            buckets.map((b, i) => {
              const x = xPos(i) - barW / 2
              const declH = (b.declared / maxVal) * chartH
              const estH  = (b.estimated / maxVal) * chartH
              const isFuture = b.key >= todayKey
              return (
                <g key={b.key}>
                  {/* Declared portion */}
                  {b.declared > 0 && (
                    <rect x={x} y={yPos(b.total)} width={barW} height={declH} fill={CHART_COLORS[0]} opacity={isFuture ? 0.6 : 1} rx={1} />
                  )}
                  {/* Estimated portion (on top) */}
                  {b.estimated > 0 && (
                    <rect x={x} y={yPos(b.estimated)} width={barW} height={estH} fill={CHART_COLORS[0]} opacity={0.35} rx={1}
                      stroke={CHART_COLORS[0]} strokeWidth={1} strokeDasharray="3 2" />
                  )}
                </g>
              )
            })
          ) : (
            // Line chart
            <>
              <polyline
                points={buckets.map((b, i) => `${xPos(i)},${yPos(b.declared)}`).join(' ')}
                fill="none" stroke={CHART_COLORS[0]} strokeWidth={2}
              />
              {buckets.some(b => b.estimated > 0) && (
                <polyline
                  points={buckets.filter(b => b.estimated > 0).map((b, i) => `${xPos(buckets.indexOf(b))},${yPos(b.total)}`).join(' ')}
                  fill="none" stroke={CHART_COLORS[0]} strokeWidth={2} strokeDasharray="6 3" opacity={0.6}
                />
              )}
              {buckets.map((b, i) => (
                <circle key={b.key} cx={xPos(i)} cy={yPos(b.total)} r={3} fill={CHART_COLORS[0]} />
              ))}
            </>
          )}

          {/* X-axis labels (show every Nth label to avoid crowding) */}
          {(() => {
            const step = Math.max(1, Math.ceil(buckets.length / 10))
            return buckets.filter((_, i) => i % step === 0 || i === buckets.length - 1).map((b, _, arr) => {
              const i = buckets.indexOf(b)
              return (
                <text key={b.key} x={xPos(i)} y={chartH + 14} textAnchor="middle" fontSize={9} fill="#64748b">
                  {b.key}
                </text>
              )
            })
          })()}

          {/* Axes */}
          <line x1={0} y1={0} x2={0} y2={chartH} stroke="#94a3b8" strokeWidth={1} />
          <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="#94a3b8" strokeWidth={1} />
        </g>
      </svg>

      {/* Legend */}
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
