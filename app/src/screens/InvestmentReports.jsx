import { useState, useEffect, useMemo } from 'react'
import { useMediaQuery, DESKTOP } from '../utils/mediaQuery'
import { getInvestingAccounts, getCashBalances, getCurrentBalance } from '../data/investingAccounts'
import { getPositions, getStockTransactionsByTicker } from '../data/stockTransactions'
import { getDividendsByTicker, computeDividendDerived } from '../data/dividends'
import { getPortfoliosFlat, getAllPortfolioAssignments } from '../data/portfolios'
import { getStockProfile, upsertStockProfile, getManualPrice } from '../data/stockProfiles'
import { getLatestPrice } from '../data/marketDataClient'
import { convertToMain, ensureRates, getCachedRates } from '../utils/currency'
import { getMainCurrency } from '../data/settings'
import {
  getReportPresets, createReportPreset, updateReportPreset, deleteReportPreset,
} from '../data/investmentReports'
import { countryDetailRegion, continentRegion, COUNTRY_DETAIL_REGIONS, CONTINENT_REGIONS } from '../utils/regionMap'
import { fmtAmt } from '../utils/format'
import styles from './InvestmentReports.module.css'

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_COLUMNS = [
  { id: 'ticker',          label: 'Ticker',            alwaysOn: true,
    hint: 'Stock ticker symbol — always shown' },
  { id: 'name',            label: 'Name',
    hint: 'Company name from stock profile' },
  { id: 'price',           label: 'Price',             numeric: true,
    hint: 'Latest price in the stock\'s native currency (live or manual override)' },
  { id: 'currency',        label: 'Currency',
    hint: 'Native trading currency of the stock' },
  { id: 'account',         label: 'Account',
    hint: 'Investing account(s) holding this position' },
  { id: 'shares',          label: 'Shares',            numeric: true,
    hint: 'Total open shares (split-adjusted)' },
  { id: 'avgPrice',        label: 'Avg price',         numeric: true,
    hint: 'Weighted-average cost per share across all open lots, in native currency' },
  { id: 'totalInvested',   label: 'Total invested',    numeric: true,
    hint: 'Current cost basis (open lots only) converted to main currency' },
  { id: 'marketValue',     label: 'Market value',      numeric: true,
    hint: 'Shares × latest price, converted to main currency' },
  { id: 'totalReturn',     label: 'Total return',      numeric: true,
    hint: 'Market value minus cost basis, in main currency (price + dividends combined)' },
  { id: 'dividendYield12m',label: 'Div yield (TTM)',   numeric: true,
    hint: 'Dividends received in the last 12 months ÷ current market value' },
  { id: 'dividendYieldFwd',label: 'Div yield (FWD)',   numeric: true,
    hint: 'Projected forward yield — requires Phase 13c dividend projections (not yet available)' },
  { id: 'paReturn',        label: 'p.a. return',       numeric: true,
    hint: 'Total return annualised since first buy date using compound formula' },
  { id: 'priceAppReturn',  label: 'Price return',      numeric: true,
    hint: 'Price-appreciation component only (market value minus cost basis, excluding dividends)' },
  { id: 'dividendReturn',  label: 'Div return',        numeric: true,
    hint: 'All dividends received since first buy, converted to main currency' },
  { id: 'shareWhole',      label: '% whole portfolio', numeric: true,
    hint: 'This position\'s market value as a share of all your positions combined' },
  { id: 'sharePortfolio',  label: '% Portfolio group', numeric: true,
    hint: 'Share within the Portfolio scope selected in the By portfolio tab — requires a scope to be set' },
  { id: 'vsTarget',        label: 'vs target %',       numeric: true,
    hint: 'Actual Portfolio group share minus target % from Portfolio assignments (positive = overweight)' },
  { id: 'hqCountry',       label: 'HQ country',
    hint: 'Company headquarters country — used for regional breakdowns; click a cell to set it' },
]

const DEFAULT_COLUMNS = ['ticker', 'name', 'price', 'marketValue', 'totalReturn', 'paReturn', 'dividendYield12m', 'shareWhole']

const INVESTMENT_TYPES = [
  { id: 'stocks',         label: 'Stocks',                    live: true },
  { id: 'options',        label: 'Options',                   live: false },
  { id: 'bonds',          label: 'Bonds',                     live: false },
  { id: 'crypto',         label: 'Crypto',                    live: false },
  { id: 'metals-storage', label: 'Precious metals — storage', live: false },
  { id: 'metals-lease',   label: 'Precious metals — lease',   live: false },
]

const BREAKDOWN_TABS = [
  { id: 'table',            label: 'Table' },
  { id: 'currency',         label: 'By currency' },
  { id: 'region-country',   label: 'By region' },
  { id: 'region-continent', label: 'By continent' },
  { id: 'portfolio',        label: 'By portfolio' },
]

const CHART_COLORS = [
  '#4A9DEC', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6',
  '#06B6D4', '#F97316', '#EC4899', '#6366F1', '#14B8A6',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPctAbs(n) {
  return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ')
}

function fmtPct(n) {
  if (n == null || !isFinite(n)) return '—'
  const sign = n >= 0 ? '+' : '-'
  return `${sign}${fmtPctAbs(n)}%`
}

function fmtPctUnsigned(n) {
  if (n == null || !isFinite(n)) return '—'
  return `${fmtPctAbs(n)}%`
}

function fmtMC(n, mc) {
  if (n == null) return '—'
  return `${fmtAmt(n)} ${mc}`
}

function getFirstBuyDate(ticker) {
  const txns = getStockTransactionsByTicker(ticker)
  const dates = txns.filter(t => t.type === 'buy').map(t => t.date).sort()
  return dates[0] ?? null
}

function computePaReturn(totalReturnPct, firstBuyDate) {
  if (firstBuyDate == null || totalReturnPct == null) return null
  const years = (Date.now() - new Date(firstBuyDate).getTime()) / (365.25 * 24 * 3600 * 1000)
  if (years < 0.0833) return null  // require at least ~1 month of history
  return (Math.pow(1 + totalReturnPct / 100, 1 / years) - 1) * 100
}

function computeDividendData(ticker, mainCurrency) {
  const divs = getDividendsByTicker(ticker)
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - 1)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  let div12m = 0, divTotal = 0
  for (const d of divs) {
    const { netTotal } = computeDividendDerived({
      dividendPerShare: d.dividendPerShare,
      shareCount: d.shareCount,
      taxPercent: d.taxPercent,
    })
    const converted = convertToMain(netTotal, d.currency, mainCurrency) ?? 0
    divTotal += converted
    if (d.payoutDate >= cutoffStr) div12m += converted
  }
  return { div12m, divTotal }
}

function gatherRawRows(accounts) {
  const rows = []
  for (const acc of accounts) {
    for (const pos of getPositions(acc.id)) {
      rows.push({ ...pos, accountId: acc.id, accountName: acc.name })
    }
  }
  return rows
}

function aggregateByTicker(rawRows) {
  const byTicker = {}
  for (const row of rawRows) {
    if (!byTicker[row.ticker]) {
      byTicker[row.ticker] = { ticker: row.ticker, currency: row.currency, shares: 0, totalCost: 0, accountNames: [] }
    }
    const e = byTicker[row.ticker]
    e.shares += row.shares
    e.totalCost += row.shares * row.avgCost
    if (!e.accountNames.includes(row.accountName)) e.accountNames.push(row.accountName)
  }
  return Object.values(byTicker).map(e => ({
    ticker: e.ticker,
    currency: e.currency,
    shares: e.shares,
    avgCost: e.shares > 0 ? e.totalCost / e.shares : 0,
    accountId: null,
    accountName: e.accountNames.join(', '),
  }))
}

function computeRows(posRows, apiPrices, mainCurrency) {
  const rows = []
  let totalMV = 0
  // First pass: compute per-row values (except shareWhole which needs the total)
  const partial = posRows.map(pos => {
    const profile = getStockProfile(pos.ticker)
    const manual = getManualPrice(pos.ticker)
    const priceInfo = manual
      ? { price: manual.amount, currency: manual.currency }
      : (apiPrices[pos.ticker] ?? null)
    const priceNative = priceInfo?.price ?? null
    const priceCurrency = priceInfo?.currency ?? pos.currency

    const marketValueNative = priceNative != null ? pos.shares * priceNative : null
    const marketValue = marketValueNative != null
      ? (convertToMain(marketValueNative, priceCurrency, mainCurrency) ?? null)
      : null

    const totalInvestedNative = pos.shares * pos.avgCost
    const totalInvested = convertToMain(totalInvestedNative, pos.currency, mainCurrency)

    const totalReturn = (marketValue != null && totalInvested != null) ? marketValue - totalInvested : null
    const totalReturnPct = (totalReturn != null && totalInvested != null && totalInvested !== 0)
      ? (totalReturn / totalInvested) * 100 : null

    const firstBuyDate = getFirstBuyDate(pos.ticker)
    const paReturn = computePaReturn(totalReturnPct, firstBuyDate)

    const { div12m, divTotal } = computeDividendData(pos.ticker, mainCurrency)
    const dividendYield12m = (div12m > 0 && marketValue != null && marketValue > 0)
      ? (div12m / marketValue) * 100 : null

    if (marketValue != null) totalMV += marketValue

    return {
      ticker: pos.ticker,
      name: profile?.name ?? null,
      priceNative,
      priceCurrency,
      nativeCurrency: pos.currency,
      account: pos.accountName,
      accountId: pos.accountId,
      shares: pos.shares,
      avgCost: pos.avgCost,
      marketValue,
      totalInvested,
      totalReturn,
      totalReturnPct,
      paReturn,
      dividendYield12m,
      dividendYieldFwd: null,
      priceAppReturn: totalReturn,
      dividendReturn: divTotal > 0 ? divTotal : null,
      div12m,
      hqCountry: profile?.hqCountry ?? null,
    }
  })

  // Second pass: fill shareWhole
  return partial.map(row => ({
    ...row,
    shareWhole: (row.marketValue != null && totalMV > 0) ? (row.marketValue / totalMV) * 100 : null,
  }))
}

function computePortfolioShares(rows, portfoliosFlat, assignments, portfolioScopeId) {
  if (!portfolioScopeId) return rows
  const scopeAssignments = assignments.filter(a => a.portfolioId === portfolioScopeId)
  const scopeTickers = new Set(scopeAssignments.map(a => a.ticker))
  const scopeMV = rows.filter(r => scopeTickers.has(r.ticker)).reduce((s, r) => s + (r.marketValue ?? 0), 0)
  return rows.map(row => {
    const assignment = scopeAssignments.find(a => a.ticker === row.ticker)
    const sharePortfolio = (assignment && row.marketValue != null && scopeMV > 0)
      ? (row.marketValue / scopeMV) * 100 : null
    const vsTarget = (sharePortfolio != null && assignment?.targetPercent != null)
      ? sharePortfolio - assignment.targetPercent : null
    return { ...row, sharePortfolio, vsTarget }
  })
}

function buildBreakdownGroups(rows, keyFn) {
  const map = {}
  for (const row of rows) {
    const key = keyFn(row)
    if (!map[key]) map[key] = 0
    map[key] += row.marketValue ?? 0
  }
  const total = Object.values(map).reduce((s, v) => s + v, 0)
  return Object.entries(map)
    .map(([label, value]) => ({ label, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
}

function computeCashTotal(accounts, mainCurrency) {
  let total = 0
  for (const acc of accounts) {
    for (const bal of getCashBalances(acc.id)) {
      const current = getCurrentBalance(bal.id)
      const converted = convertToMain(current, bal.currency, mainCurrency)
      if (converted != null) total += converted
    }
  }
  return total
}

function currentConfig(typeFilter, grouping, columns, breakdown, portfolioScopeId) {
  return { typeFilter, grouping, columns, breakdown, portfolioScopeId }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InvestmentReports() {
  const isDesktop = useMediaQuery(DESKTOP)
  const mainCurrency = getMainCurrency()

  // ── Config state ─────────────────────────────────────────────────────────────
  const [presets,      setPresets]      = useState(() => getReportPresets())
  const [presetId,     setPresetId]     = useState(null)
  const [typeFilter,   setTypeFilter]   = useState(['stocks'])
  const [grouping,     setGrouping]     = useState('stock')
  const [columns,      setColumns]      = useState(DEFAULT_COLUMNS)
  const [breakdown,    setBreakdown]    = useState('table')
  const [portfolioScopeId, setPortfolioScopeId] = useState(null)
  const [breakdownView, setBreakdownView] = useState('chart') // 'chart' | 'table'
  const [columnPickerOpen, setColumnPickerOpen] = useState(false)

  // ── Preset dialogs ───────────────────────────────────────────────────────────
  const [saveDialog,   setSaveDialog]   = useState(false)
  const [saveName,     setSaveName]     = useState('')
  const [manageOpen,   setManageOpen]   = useState(false)
  const [renamingId,   setRenamingId]   = useState(null)
  const [renameValue,  setRenameValue]  = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  // ── Prices state ─────────────────────────────────────────────────────────────
  const [apiPrices,    setApiPrices]    = useState({})
  const [pricesLoading, setPricesLoading] = useState(false)
  const [ratesStatus,  setRatesStatus]  = useState('idle') // 'idle'|'loading'|'ok'|'error'
  const [ratesVersion, setRatesVersion] = useState(0)

  // ── Country edit ─────────────────────────────────────────────────────────────
  const [editingCountry, setEditingCountry] = useState(null) // ticker
  const [countryDraft,   setCountryDraft]   = useState('')

  // ── Data ─────────────────────────────────────────────────────────────────────
  const accounts     = useMemo(() => getInvestingAccounts(), [])
  const portfolios   = useMemo(() => getPortfoliosFlat(), [])
  const assignments  = useMemo(() => getAllPortfolioAssignments(), [])

  const rawRows = useMemo(() => gatherRawRows(accounts), [accounts])

  const posRows = useMemo(
    () => grouping === 'stock' ? aggregateByTicker(rawRows) : rawRows,
    [rawRows, grouping]
  )

  // Fetch prices when posRows change
  useEffect(() => {
    const tickers = [...new Set(posRows.map(r => r.ticker))]
    const needFetch = tickers.filter(t => !getManualPrice(t))
    if (needFetch.length === 0) return
    let cancelled = false
    setPricesLoading(true)
    Promise.allSettled(
      needFetch.map(ticker => {
        const profile = getStockProfile(ticker)
        return getLatestPrice(ticker, profile?.stockExchange ?? null)
          .then(result => [ticker, result])
          .catch(() => [ticker, null])
      })
    ).then(results => {
      if (cancelled) return
      const map = {}
      for (const { status, value } of results) {
        if (status === 'fulfilled' && value?.[1] != null) {
          map[value[0]] = value[1]
        }
      }
      setApiPrices(map)
      setPricesLoading(false)
    })
    return () => { cancelled = true }
  }, [posRows])

  // Auto-load exchange rates on mount (and when mainCurrency changes)
  useEffect(() => {
    ensureRates(mainCurrency)
      .then(() => setRatesVersion(v => v + 1))
      .catch(() => {})
  }, [mainCurrency])

  const allRows = useMemo(
    () => computeRows(posRows, apiPrices, mainCurrency),
    [posRows, apiPrices, mainCurrency, ratesVersion]
  )

  const rowsWithPortfolio = useMemo(
    () => computePortfolioShares(allRows, portfolios, assignments, portfolioScopeId),
    [allRows, portfolios, assignments, portfolioScopeId]
  )

  const displayRows = useMemo(() => {
    if (typeFilter.includes('stocks')) return rowsWithPortfolio
    return []
  }, [rowsWithPortfolio, typeFilter])

  const totalPositionsMV = useMemo(
    () => displayRows.reduce((s, r) => s + (r.marketValue ?? 0), 0),
    [displayRows]
  )
  const totalCash = useMemo(() => computeCashTotal(accounts, mainCurrency), [accounts, mainCurrency])
  const totalValue = totalPositionsMV + totalCash

  // ── Breakdown groups ─────────────────────────────────────────────────────────
  const currencyGroups = useMemo(
    () => buildBreakdownGroups(displayRows, r => r.nativeCurrency),
    [displayRows]
  )
  const regionCountryGroups = useMemo(
    () => buildBreakdownGroups(displayRows, r => countryDetailRegion(r.hqCountry)),
    [displayRows]
  )
  const regionContinentGroups = useMemo(
    () => buildBreakdownGroups(displayRows, r => continentRegion(r.hqCountry)),
    [displayRows]
  )
  const portfolioGroups = useMemo(() => {
    if (!portfolios.length) return []
    // Build map: portfolioId → MV of assigned tickers
    const mvByPortfolio = {}
    for (const p of portfolios) {
      const tickers = new Set(assignments.filter(a => a.portfolioId === p.id).map(a => a.ticker))
      mvByPortfolio[p.id] = displayRows.filter(r => tickers.has(r.ticker)).reduce((s, r) => s + (r.marketValue ?? 0), 0)
    }
    const assigned = new Set(assignments.map(a => a.ticker))
    const unassignedMV = displayRows.filter(r => !assigned.has(r.ticker)).reduce((s, r) => s + (r.marketValue ?? 0), 0)
    const groups = portfolios.map(p => ({ label: p.name, value: mvByPortfolio[p.id] ?? 0 }))
    if (unassignedMV > 0) groups.push({ label: 'Unassigned', value: unassignedMV })
    const total = groups.reduce((s, g) => s + g.value, 0)
    return groups.filter(g => g.value > 0).map(g => ({ ...g, pct: total > 0 ? (g.value / total) * 100 : 0 })).sort((a, b) => b.value - a.value)
  }, [displayRows, portfolios, assignments])

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function loadPreset(id) {
    const preset = presets.find(p => p.id === id)
    if (!preset) return
    const c = preset.config
    if (c.typeFilter)       setTypeFilter(c.typeFilter)
    if (c.grouping)         setGrouping(c.grouping)
    if (c.columns)          setColumns(c.columns)
    if (c.breakdown)        setBreakdown(c.breakdown)
    if ('portfolioScopeId' in c) setPortfolioScopeId(c.portfolioScopeId)
    setPresetId(id)
  }

  function handleSavePreset() {
    if (presetId) {
      // Update existing
      const name = presets.find(p => p.id === presetId)?.name ?? ''
      updateReportPreset(presetId, { config: currentConfig(typeFilter, grouping, columns, breakdown, portfolioScopeId) })
      setPresets(getReportPresets())
    } else {
      setSaveName('')
      setSaveDialog(true)
    }
  }

  function handleSaveNewPreset() {
    if (!saveName.trim()) return
    const preset = createReportPreset({
      name: saveName.trim(),
      config: currentConfig(typeFilter, grouping, columns, breakdown, portfolioScopeId),
    })
    setPresets(getReportPresets())
    setPresetId(preset.id)
    setSaveDialog(false)
  }

  async function handleRefreshRates() {
    setRatesStatus('loading')
    try {
      await ensureRates(mainCurrency, true)
      setRatesVersion(v => v + 1)
      setRatesStatus('ok')
    } catch {
      setRatesStatus('error')
    }
    setTimeout(() => setRatesStatus('idle'), 3000)
  }

  function toggleType(id) {
    setTypeFilter(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
    setPresetId(null)
  }

  function toggleColumn(id) {
    const col = ALL_COLUMNS.find(c => c.id === id)
    if (col?.alwaysOn) return
    setColumns(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
    setPresetId(null)
  }

  function handleSaveCountry() {
    if (!editingCountry) return
    upsertStockProfile(editingCountry, { hqCountry: countryDraft.trim() || null })
    setEditingCountry(null)
    setCountryDraft('')
    // Force re-render by mutating a dummy state (profiles read fresh each render)
    setApiPrices(p => ({ ...p }))
  }

  const activeColumns = ALL_COLUMNS.filter(c => columns.includes(c.id) || c.alwaysOn)

  function getBreakdownGroups() {
    if (breakdown === 'currency')         return currencyGroups
    if (breakdown === 'region-country')   return regionCountryGroups
    if (breakdown === 'region-continent') return regionContinentGroups
    if (breakdown === 'portfolio')        return portfolioGroups
    return []
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={styles.screen}>

      {/* ── Preset bar ────────────────────────────────────────────────────────── */}
      <div className={styles.presetBar}>
        <div className={styles.presetLeft}>
          <label className={styles.presetLabel}>Preset:</label>
          <select
            className={styles.presetSelect}
            value={presetId ?? ''}
            onChange={e => e.target.value ? loadPreset(e.target.value) : setPresetId(null)}
          >
            <option value="">— none —</option>
            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className={styles.btnSm} onClick={handleSavePreset}>
            {presetId ? 'Update preset' : 'Save preset'}
          </button>
          <button className={styles.btnSm} onClick={() => setManageOpen(true)}>Manage presets</button>
        </div>
        <div className={styles.presetRight}>
          <span className={styles.currencyBadge}>{mainCurrency}</span>
          <button
            className={styles.btnSm}
            onClick={handleRefreshRates}
            disabled={ratesStatus === 'loading'}
          >
            {ratesStatus === 'loading' ? 'Refreshing…' : ratesStatus === 'ok' ? 'Rates refreshed' : ratesStatus === 'error' ? 'Refresh failed' : 'Refresh rates'}
          </button>
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────────── */}
      <div className={styles.filterBar}>
        <div className={styles.typeFilter}>
          {INVESTMENT_TYPES.map(t => (
            <label
              key={t.id}
              className={`${styles.typeChip} ${typeFilter.includes(t.id) ? styles.typeChipOn : ''} ${!t.live ? styles.typeChipPlaceholder : ''}`}
            >
              <input
                type="checkbox"
                checked={typeFilter.includes(t.id)}
                onChange={() => toggleType(t.id)}
              />
              {t.label}
              {!t.live && <span className={styles.placeholder}> *</span>}
            </label>
          ))}
        </div>
        <div className={styles.groupingRow}>
          <span className={styles.groupLabel}>Group by:</span>
          <label className={styles.radioLabel}>
            <input type="radio" name="grouping" value="stock" checked={grouping === 'stock'} onChange={() => { setGrouping('stock'); setPresetId(null) }} />
            Stock
          </label>
          <label className={styles.radioLabel}>
            <input type="radio" name="grouping" value="stock-x-account" checked={grouping === 'stock-x-account'} onChange={() => { setGrouping('stock-x-account'); setPresetId(null) }} />
            Stock × account
          </label>
        </div>
      </div>

      {/* ── Breakdown tabs ────────────────────────────────────────────────────── */}
      <div className={styles.tabBar}>
        {BREAKDOWN_TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${breakdown === t.id ? styles.tabActive : ''}`}
            onClick={() => { setBreakdown(t.id); setPresetId(null) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Summary bar ───────────────────────────────────────────────────────── */}
      <div className={styles.summaryBar}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Total value</span>
          <span className={styles.summaryValue}>{fmtMC(totalValue, mainCurrency)}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Positions</span>
          <span className={styles.summaryValue}>{fmtMC(totalPositionsMV, mainCurrency)}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Cash</span>
          <span className={styles.summaryValue}>{fmtMC(totalCash, mainCurrency)}</span>
        </div>
        {pricesLoading && <span className={styles.loadingNote}>Fetching prices…</span>}
      </div>

      {/* ── Table view ────────────────────────────────────────────────────────── */}
      {breakdown === 'table' && (
        <div className={styles.tableSection}>
          <div className={styles.tableTitleRow}>
            <span className={styles.tablePositionCount}>{displayRows.length} position{displayRows.length !== 1 ? 's' : ''}</span>
            <div className={styles.tableTitleRight}>
              {(columns.includes('sharePortfolio') || columns.includes('vsTarget')) && portfolios.length > 0 && (
                <div className={styles.scopeRow}>
                  <label className={styles.scopeLabel}>Portfolio scope:</label>
                  <select
                    className={styles.scopeSelect}
                    value={portfolioScopeId ?? ''}
                    onChange={e => setPortfolioScopeId(e.target.value || null)}
                  >
                    <option value="">— All portfolios —</option>
                    {portfolios.map(p => (
                      <option key={p.id} value={p.id}>
                        {' '.repeat(p.depth * 2)}{p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                className={styles.btnSm}
                onClick={() => setColumnPickerOpen(o => !o)}
              >
                Configure columns
              </button>
            </div>
          </div>

          {columnPickerOpen && (
            <div className={styles.columnPicker}>
              <div className={styles.columnPickerTitle}>Visible columns</div>
              <div className={styles.columnPickerGrid}>
                {ALL_COLUMNS.map(col => (
                  <label key={col.id} className={`${styles.columnPickerRow} ${col.alwaysOn ? styles.columnPickerDisabled : ''}`}>
                    <input
                      type="checkbox"
                      checked={columns.includes(col.id) || !!col.alwaysOn}
                      disabled={!!col.alwaysOn}
                      onChange={() => toggleColumn(col.id)}
                    />
                    <span className={styles.columnPickerLabel}>
                      {col.label}
                      {col.hint && <span className={styles.columnPickerHint}>{col.hint}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {displayRows.length === 0 ? (
            <p className={styles.empty}>
              {typeFilter.every(t => !INVESTMENT_TYPES.find(x => x.id === t)?.live)
                ? 'No live data for the selected type(s). Stocks is the only type with real data in Phase 2.'
                : 'No positions found.'}
            </p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {activeColumns.map(col => (
                      <th key={col.id} className={`${styles.th} ${col.numeric ? styles.thNum : ''}`} title={col.hint}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, i) => (
                    <tr key={`${row.ticker}-${row.accountId ?? i}`} className={styles.tr}>
                      {activeColumns.map(col => (
                        <td key={col.id} className={`${styles.td} ${col.numeric ? styles.tdNum : ''}`}>
                          {renderCell(col.id, row, mainCurrency, editingCountry, countryDraft, setEditingCountry, setCountryDraft, handleSaveCountry)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={styles.totalRow}>
                    {activeColumns.map(col => (
                      <td key={col.id} className={`${styles.tdTotal} ${col.numeric ? styles.tdNum : ''}`}>
                        {renderTotalCell(col.id, displayRows, mainCurrency)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Breakdown views ───────────────────────────────────────────────────── */}
      {breakdown !== 'table' && (
        <BreakdownSection
          groups={getBreakdownGroups()}
          mainCurrency={mainCurrency}
          isDesktop={isDesktop}
          breakdownView={breakdownView}
          setBreakdownView={setBreakdownView}
          breakdown={breakdown}
          portfolios={portfolios}
          portfolioScopeId={portfolioScopeId}
          setPortfolioScopeId={setPortfolioScopeId}
          displayRows={displayRows}
        />
      )}

      {/* ── Save preset dialog ────────────────────────────────────────────────── */}
      {saveDialog && (
        <div className={styles.dialogBackdrop}>
          <div className={styles.dialog}>
            <h3 className={styles.dialogTitle}>Save preset</h3>
            <input
              className={styles.dialogInput}
              type="text"
              placeholder="Preset name"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveNewPreset()}
              autoFocus
            />
            <div className={styles.dialogActions}>
              <button className={styles.btnSec} onClick={() => setSaveDialog(false)}>Cancel</button>
              <button className={styles.btnPrimary} onClick={handleSaveNewPreset} disabled={!saveName.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manage presets dialog ─────────────────────────────────────────────── */}
      {manageOpen && (
        <div className={styles.dialogBackdrop}>
          <div className={styles.dialog}>
            <h3 className={styles.dialogTitle}>Saved presets</h3>
            {presets.length === 0 ? (
              <p className={styles.empty}>No saved presets yet.</p>
            ) : (
              <div className={styles.presetList}>
                {presets.map(p => (
                  <div key={p.id} className={styles.presetListRow}>
                    {renamingId === p.id ? (
                      <>
                        <input
                          className={styles.renameInput}
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { updateReportPreset(p.id, { name: renameValue.trim() }); setPresets(getReportPresets()); setRenamingId(null) }
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                          autoFocus
                        />
                        <button className={styles.btnSm} onClick={() => { updateReportPreset(p.id, { name: renameValue.trim() }); setPresets(getReportPresets()); setRenamingId(null) }}>Save</button>
                        <button className={styles.btnSec} onClick={() => setRenamingId(null)}>Cancel</button>
                      </>
                    ) : deleteConfirmId === p.id ? (
                      <>
                        <span className={styles.presetName}>Delete "{p.name}"?</span>
                        <button className={styles.btnDanger} onClick={() => { deleteReportPreset(p.id); setPresets(getReportPresets()); if (presetId === p.id) setPresetId(null); setDeleteConfirmId(null) }}>Delete</button>
                        <button className={styles.btnSec} onClick={() => setDeleteConfirmId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <span className={styles.presetName}>{p.name}</span>
                        <button className={styles.btnSm} onClick={() => { loadPreset(p.id); setManageOpen(false) }}>Load</button>
                        <button className={styles.btnSm} onClick={() => { setRenamingId(p.id); setRenameValue(p.name) }}>Rename</button>
                        <button className={styles.btnSmDanger} onClick={() => setDeleteConfirmId(p.id)}>Delete</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className={styles.dialogActions}>
              <button className={styles.btnSec} onClick={() => { setManageOpen(false); setRenamingId(null); setDeleteConfirmId(null) }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Cell rendering ───────────────────────────────────────────────────────────

function renderCell(colId, row, mc, editingCountry, countryDraft, setEditingCountry, setCountryDraft, handleSaveCountry) {
  switch (colId) {
    case 'ticker':         return <strong>{row.ticker}</strong>
    case 'name':           return row.name ?? <span className={styles.na}>—</span>
    case 'price':          return row.priceNative != null ? `${fmtAmt(row.priceNative)} ${row.priceCurrency}` : <span className={styles.na}>—</span>
    case 'currency':       return row.nativeCurrency
    case 'account':        return row.account
    case 'shares':         return Number(row.shares.toFixed(6))
    case 'avgPrice':       return row.avgCost != null ? `${fmtAmt(row.avgCost)} ${row.nativeCurrency}` : <span className={styles.na}>—</span>
    case 'totalInvested':  return fmtMC(row.totalInvested, mc)
    case 'marketValue':    return fmtMC(row.marketValue, mc)
    case 'totalReturn':    return renderReturn(row.totalReturn, row.totalReturnPct, mc)
    case 'dividendYield12m': return row.dividendYield12m != null ? fmtPct(row.dividendYield12m) : <span className={styles.na}>—</span>
    case 'dividendYieldFwd': return <span className={styles.na}>—</span>
    case 'paReturn':       return row.paReturn != null ? <span className={row.paReturn >= 0 ? styles.pos : styles.neg}>{fmtPct(row.paReturn)}</span> : <span className={styles.na}>—</span>
    case 'priceAppReturn': return renderReturn(row.priceAppReturn, row.totalReturnPct, mc)
    case 'dividendReturn': return row.dividendReturn != null ? fmtMC(row.dividendReturn, mc) : <span className={styles.na}>—</span>
    case 'shareWhole':     return row.shareWhole != null ? fmtPctUnsigned(row.shareWhole) : <span className={styles.na}>—</span>
    case 'sharePortfolio': return row.sharePortfolio != null ? fmtPctUnsigned(row.sharePortfolio) : <span className={styles.na}>—</span>
    case 'vsTarget':       return row.vsTarget != null ? <span className={Math.abs(row.vsTarget) < 1 ? '' : styles.warn}>{fmtPct(row.vsTarget)}</span> : <span className={styles.na}>—</span>
    case 'hqCountry':
      if (editingCountry === row.ticker) {
        return (
          <span className={styles.countryEdit}>
            <input
              className={styles.countryInput}
              value={countryDraft}
              onChange={e => setCountryDraft(e.target.value)}
              placeholder="ISO code, e.g. US"
              onKeyDown={e => { if (e.key === 'Enter') handleSaveCountry(); if (e.key === 'Escape') setEditingCountry(null) }}
              autoFocus
            />
            <button className={styles.btnXs} onClick={handleSaveCountry}>✓</button>
            <button className={styles.btnXs} onClick={() => setEditingCountry(null)}>✕</button>
          </span>
        )
      }
      return (
        <span
          className={styles.hqCountryCell}
          onClick={() => { setEditingCountry(row.ticker); setCountryDraft(row.hqCountry ?? '') }}
          title="Click to set HQ country"
        >
          {row.hqCountry ?? <span className={styles.naLink}>set</span>}
        </span>
      )
    default: return null
  }
}

function renderReturn(value, pct, mc) {
  if (value == null) return <span className={styles.na}>—</span>
  const sign = value >= 0 ? '+' : ''
  const cls = value >= 0 ? styles.pos : styles.neg
  return (
    <span className={cls}>
      {sign}{fmtAmt(value)} {mc}
      {pct != null && <span className={styles.returnPct}> ({fmtPct(pct)})</span>}
    </span>
  )
}

function renderTotalCell(colId, rows, mc) {
  if (colId === 'ticker') return 'Total'
  if (colId === 'marketValue')    return fmtMC(rows.reduce((s, r) => s + (r.marketValue ?? 0), 0), mc)
  if (colId === 'totalInvested')  return fmtMC(rows.reduce((s, r) => s + (r.totalInvested ?? 0), 0), mc)
  if (colId === 'totalReturn')    return fmtMC(rows.reduce((s, r) => s + (r.totalReturn ?? 0), 0), mc)
  if (colId === 'dividendReturn') return fmtMC(rows.reduce((s, r) => s + (r.dividendReturn ?? 0), 0), mc)
  if (colId === 'paReturn') {
    const valid = rows.filter(r => r.paReturn != null && r.marketValue != null && r.marketValue > 0)
    if (valid.length === 0) return null
    const totalMV = valid.reduce((s, r) => s + r.marketValue, 0)
    const weighted = valid.reduce((s, r) => s + r.paReturn * r.marketValue, 0)
    const result = weighted / totalMV
    return <span className={result >= 0 ? styles.pos : styles.neg}>{fmtPct(result)}</span>
  }
  return null
}

// ─── Breakdown section ────────────────────────────────────────────────────────

function BreakdownSection({ groups, mainCurrency, isDesktop, breakdownView, setBreakdownView, breakdown, portfolios, portfolioScopeId, setPortfolioScopeId, displayRows }) {
  const total = groups.reduce((s, g) => s + g.value, 0)

  return (
    <div className={styles.breakdownSection}>
      <div className={styles.breakdownToolbar}>
        <div className={styles.viewToggle}>
          <button className={`${styles.viewBtn} ${breakdownView === 'chart' ? styles.viewBtnActive : ''}`} onClick={() => setBreakdownView('chart')}>Chart</button>
          <button className={`${styles.viewBtn} ${breakdownView === 'table' ? styles.viewBtnActive : ''}`} onClick={() => setBreakdownView('table')}>Table</button>
        </div>
        {breakdown === 'portfolio' && portfolios.length > 0 && (
          <div className={styles.scopeRow}>
            <label className={styles.scopeLabel}>Portfolio scope:</label>
            <select
              className={styles.scopeSelect}
              value={portfolioScopeId ?? ''}
              onChange={e => setPortfolioScopeId(e.target.value || null)}
            >
              <option value="">All portfolios</option>
              {portfolios.map(p => <option key={p.id} value={p.id}>{' '.repeat(p.depth * 2)}{p.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <p className={styles.empty}>No position data available for this breakdown.</p>
      ) : (
        <div className={isDesktop && breakdownView === 'chart' ? styles.breakdownSplit : ''}>
          {breakdownView === 'chart' && (
            <div className={styles.chartPane}>
              <PieChart groups={groups} mainCurrency={mainCurrency} />
            </div>
          )}
          <div className={styles.breakdownTablePane}>
            <table className={styles.breakdownTable}>
              <thead>
                <tr>
                  <th className={styles.th}>Group</th>
                  <th className={styles.th}>Value ({mainCurrency})</th>
                  <th className={styles.th}>Share</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                  <tr key={g.label} className={styles.tr}>
                    <td className={styles.td}>{g.label}</td>
                    <td className={styles.td}>{fmtAmt(g.value)}</td>
                    <td className={styles.td}>
                      <span className={styles.pctBar}>
                        <span className={styles.pctBarFill} style={{ width: `${Math.min(g.pct, 100)}%` }} />
                      </span>
                      {g.pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={styles.totalRow}>
                  <td className={styles.tdTotal}>Total</td>
                  <td className={styles.tdTotal}>{fmtAmt(total)}</td>
                  <td className={styles.tdTotal}>100%</td>
                </tr>
              </tfoot>
            </table>
            {breakdown === 'region-country' && displayRows.some(r => !r.hqCountry) && (
              <p className={styles.countryNote}>
                Positions without an HQ country are grouped under "Global". Set HQ country in the Table tab.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Pie chart ────────────────────────────────────────────────────────────────

function PieChart({ groups, mainCurrency }) {
  const total = groups.reduce((s, g) => s + g.value, 0)
  const size = 220
  const cx = size / 2, cy = size / 2
  const r = size * 0.38, innerR = size * 0.18

  let angle = -Math.PI / 2
  const arcs = groups.map((g, i) => {
    const fraction = total > 0 ? g.value / total : 0
    const sweep = fraction * 2 * Math.PI
    const start = angle
    angle += sweep
    const end = angle
    const large = sweep > Math.PI ? 1 : 0
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(end),   y2 = cy + r * Math.sin(end)
    const ix1 = cx + innerR * Math.cos(start), iy1 = cy + innerR * Math.sin(start)
    const ix2 = cx + innerR * Math.cos(end),   iy2 = cy + innerR * Math.sin(end)
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${large} 0 ${ix1} ${iy1} Z`
    return { d, color: CHART_COLORS[i % CHART_COLORS.length], label: g.label, pct: fraction * 100, value: g.value }
  })

  return (
    <div className={styles.pieWrapper}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.pieSvg}>
        {arcs.map((arc, i) => (
          <path key={i} d={arc.d} fill={arc.color} stroke="var(--bg-screen, #fff)" strokeWidth="2" />
        ))}
      </svg>
      <div className={styles.legend}>
        {arcs.map((arc, i) => (
          <div key={i} className={styles.legendRow}>
            <span className={styles.legendDot} style={{ background: arc.color }} />
            <span className={styles.legendLabel}>{arc.label}</span>
            <span className={styles.legendPct}>{arc.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
