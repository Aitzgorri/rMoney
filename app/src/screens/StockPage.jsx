import { useState, useEffect, useCallback, useRef } from 'react'
import { getStockTransactionsByTicker, getPositions, applySplit, updateSplit, createBuy, createSell } from '../data/stockTransactions'
import { getDividendsByTicker, computeDividendDerived, resolveDividendTaxPercent, updateDividend, createDividend } from '../data/dividends'
import { getInvestingAccounts, getCashBalances, getCashBalanceByCurrency, getCurrentBalance } from '../data/investingAccounts'
import { getAllPortfolioAssignments, getPortfolios } from '../data/portfolios'
import { getStockProfile, upsertStockProfile, getManualPrice, setManualPrice, clearManualPrice, renameTicker } from '../data/stockProfiles'
import {
  getLatestManualPrice as getLatestManualStockPrice,
  getManualPricesForTicker,
  setManualPriceEntry,
  deleteManualPriceEntry,
} from '../data/manualPrices'
import { getLatestPrice, getHistoricalSeries, getIntradaySeries, getNews } from '../data/marketDataClient'
import { refreshApiDividendHistory, isStaleForTicker, getApiDividendHistoryForTicker, upsertApiDividends } from '../data/apiDividendHistory'
import { getMainCurrency, getDividendEstimationRule } from '../data/settings'
import { computeProjections, detectEffectiveDividendFrequency } from '../utils/dividendProjections'
import { convertToMain, ensureRates, snapshotFxRates } from '../utils/currency'
import { fmtAmt } from '../utils/format'
import { computeXirr } from '../utils/xirr'
import { BuyForm, SellForm, DividendForm } from './InvestingAccountDetail'
import AiChatPanel from '../components/AiChatPanel'
import CurrencyToggle from '../components/CurrencyToggle'
import StockProfileResolutionDialog from '../components/StockProfileResolutionDialog'
import TickerRenameDialog from '../components/TickerRenameDialog'
import EditProfileDialog from '../components/EditProfileDialog'
import styles from './StockPage.module.css'

function fmtPct(n) {
  if (n == null || !isFinite(n)) return '—'
  const sign = n >= 0 ? '+' : '-'
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ')
  return `${sign}${abs}%`
}

// ─── Dividend list columns (SPEC-021 / Phase 32b) ─────────────────────────────
// Always-visible columns can't be hidden via the picker. The `netMain` column
// is conditional on the currency toggle being set to Main.
const DIV_COLUMNS = [
  { id: 'exDate',   label: 'Ex-div',     title: 'Ex-dividend date',                                                       mandatory: true,  minWidth: 90  },
  { id: 'payDate',  label: 'Pay',        title: 'Payout date',                                                            mandatory: true,  minWidth: 85  },
  { id: 'perShare', label: 'Per share',  title: 'Dividend amount per share (trading currency)',                           mandatory: true,  minWidth: 110 },
  { id: 'shares',   label: 'Shares',     title: 'Eligible share count on the ex-dividend date',                                             minWidth: 70  },
  { id: 'taxPct',   label: 'Tax %',      title: 'Tax withholding percent applied to this payout',                                           minWidth: 55  },
  { id: 'net',      label: 'Net',        title: 'Net amount after tax (trading currency)',                                 mandatory: true,  minWidth: 105 },
  { id: 'netMain',  label: 'Net (main)', title: 'Net amount converted to your main currency',                                              minWidth: 105, conditional: 'main' },
  { id: 'type',     label: 'Type',       title: 'Regular or Special dividend',                                                              minWidth: 80  },
  { id: 'source',   label: 'Source',     title: 'Where this record comes from: User entry, API fetch, Declared, Estimated',                 minWidth: 80  },
  { id: 'account',  label: 'Account',    title: 'Investing account that received the payout',                                               minWidth: 100, defaultHidden: true },
  { id: 'actions',  label: '',           title: '',                                                                        mandatory: true,  minWidth: 92  },
]

function loadHiddenDivCols() {
  try {
    const raw = localStorage.getItem('rmoney_dividend_columns')
    if (!raw) return new Set(DIV_COLUMNS.filter(c => c.defaultHidden).map(c => c.id))
    return new Set(JSON.parse(raw))
  } catch {
    return new Set(DIV_COLUMNS.filter(c => c.defaultHidden).map(c => c.id))
  }
}

function saveHiddenDivCols(set) {
  try { localStorage.setItem('rmoney_dividend_columns', JSON.stringify([...set])) } catch { /* ignore */ }
}

// ─── StockPage ────────────────────────────────────────────────────────────────

export default function StockPage({ ticker, onBack, onNavigate }) {
  const [txFilter, setTxFilter] = useState('all')
  const [splitFormOpen, setSplitFormOpen] = useState(false)
  const [splitDate,     setSplitDate]     = useState(() => new Date().toISOString().slice(0, 10))
  const [splitNum,      setSplitNum]      = useState('2')
  const [splitDen,      setSplitDen]      = useState('1')
  const [splitError,    setSplitError]    = useState('')
  const [resolving,       setResolving]       = useState(false)
  const [profileKey,      setProfileKey]      = useState(0)  // bump to re-read profile after resolution
  const [renaming,        setRenaming]        = useState(false)
  const [editingProfile,  setEditingProfile]  = useState(false)
  const [editingSplitTx,  setEditingSplitTx]  = useState(null)  // split stockTransaction being edited
  const [manualPriceForm, setManualPriceForm] = useState(null)   // null | { amount: string, currency: string }
  const [manualPriceKey,  setManualPriceKey]  = useState(0)      // bump to re-read manual price after save/clear
  const [manualStockForm, setManualStockForm] = useState(null)   // null | { date, amount, currency } — for isManual stocks
  const [manualStockListOpen, setManualStockListOpen] = useState(false)
  const [livePrice,       setLivePrice]       = useState(null)   // null | { price, currency, asOf, providerName }
  const [priceStatus,     setPriceStatus]     = useState('idle') // 'idle' | 'loading' | 'unavailable'
  const [chartPeriod,     setChartPeriod]     = useState('6M')
  const [chartData,       setChartData]       = useState([])
  const [chartStatus,     setChartStatus]     = useState('idle') // 'idle' | 'loading' | 'unavailable'
  const [intradayUnsupported, setIntradayUnsupported] = useState(null) // null=unknown | true | false
  const [news,            setNews]            = useState([])
  const [newsStatus,      setNewsStatus]      = useState('idle') // 'idle' | 'loading' | 'unavailable'
  const [ratesVersion,    setRatesVersion]    = useState(0)
  const [divRefreshStatus, setDivRefreshStatus] = useState('idle') // 'idle' | 'loading' | 'failed'
  const [divHistoryKey,    setDivHistoryKey]    = useState(0)      // bump to re-read stale indicator
  const [currencyMode,     setCurrencyMode]     = useState(() => localStorage.getItem('rmoney_currency_toggle_stock') ?? 'trading')
  const [yieldDetailKind,  setYieldDetailKind]  = useState(null) // null | 'ttm-price' | 'ttm-cost' | 'forward-price' | 'forward-cost'
  const [portfolioMvPcts,  setPortfolioMvPcts]  = useState({})   // portfolioId → % share | null
  const [payoutChunksVisible, setPayoutChunksVisible] = useState(1) // year-chunks loaded in past-payouts table
  const [editingDividend,     setEditingDividend]     = useState(null) // user dividend record being edited
  const [convertingEstimated, setConvertingEstimated] = useState(null) // estimated future payout being converted
  const [declaringNew,        setDeclaringNew]        = useState(false) // standalone + Declare dialog
  const [divColPickerOpen,    setDivColPickerOpen]    = useState(false) // dividend column picker dropdown
  const [divHiddenCols,       setDivHiddenCols]       = useState(() => loadHiddenDivCols())
  const payoutListRef = useRef(null)
  const divColPickerRef = useRef(null)

  const [actionForm,       setActionForm]       = useState(null)  // null | 'buy' | 'sell' | 'dividend'
  const [actionAccountId,  setActionAccountId]  = useState(null)
  const [pickingAccount,   setPickingAccount]   = useState(null)  // null | 'buy' | 'sell' | 'dividend'
  const [actionNegConfirm, setActionNegConfirm] = useState(null)  // null | { message, onConfirm }

  const norm = ticker?.trim().toUpperCase() ?? ''

  // profileKey / manualPriceKey state bumps force re-renders; reads below stay fresh each render
  const profile     = getStockProfile(norm)
  const manualPrice = getManualPrice(norm)
  const isManualStockProfile = profile?.isManual === true
  // Latest user-entered price for manual stocks (Phase 32e). Replaces the live-price line entirely.
  const latestManualStock = isManualStockProfile ? getLatestManualStockPrice(norm) : null

  const fetchPrice = useCallback(async (forceRefresh = false) => {
    if (manualPrice || isManualStockProfile) return   // override or manual stock — no API call needed
    setPriceStatus('loading')
    try {
      const result = await getLatestPrice(norm, profile?.stockExchange ?? null, { forceRefresh })
      setLivePrice(result)
      setPriceStatus('idle')
    } catch {
      setPriceStatus('unavailable')
    }
  }, [norm, profile?.stockExchange, manualPrice, isManualStockProfile])

  useEffect(() => { fetchPrice() }, [fetchPrice])

  const PERIOD_RESOLUTION = { '1M': 'daily', '3M': 'daily', '6M': 'daily', '1Y': 'daily', '5Y': 'weekly', 'All': 'monthly' }

  useEffect(() => {
    let cancelled = false
    setChartStatus('loading')
    setChartData([])
    if (chartPeriod === '1D') {
      getIntradaySeries(norm, profile?.stockExchange ?? null)
        .then(data => {
          if (!cancelled) {
            setIntradayUnsupported(false)
            setChartData((data ?? []).map(d => ({ date: d.time, close: d.close })))
            setChartStatus('idle')
          }
        })
        .catch(() => {
          if (!cancelled) {
            setIntradayUnsupported(true)
            setChartStatus('unavailable')
          }
        })
    } else {
      getHistoricalSeries(norm, profile?.stockExchange ?? null, chartPeriod, PERIOD_RESOLUTION[chartPeriod])
        .then(data => { if (!cancelled) { setChartData(data ?? []); setChartStatus('idle') } })
        .catch(() => { if (!cancelled) setChartStatus('unavailable') })
    }
    return () => { cancelled = true }
  }, [norm, profile?.stockExchange, chartPeriod])

  useEffect(() => {
    let cancelled = false
    setNewsStatus('loading')
    getNews(norm)
      .then(items => { if (!cancelled) { setNews(items ?? []); setNewsStatus('idle') } })
      .catch(() => { if (!cancelled) setNewsStatus('unavailable') })
    return () => { cancelled = true }
  }, [norm])

  const mainCurrency = getMainCurrency()
  useEffect(() => {
    ensureRates(mainCurrency).then(() => setRatesVersion(v => v + 1)).catch(() => {})
  }, [mainCurrency])

  useEffect(() => { setPayoutChunksVisible(1); setIntradayUnsupported(null) }, [norm])

  // Close the dividend column picker on outside click
  useEffect(() => {
    if (!divColPickerOpen) return
    function onMouseDown(e) {
      if (!divColPickerRef.current?.contains(e.target)) setDivColPickerOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [divColPickerOpen])

  function toggleDivCol(id) {
    setDivHiddenCols(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      saveHiddenDivCols(next)
      return next
    })
  }

  const accounts     = getInvestingAccounts()
  const accountsById = Object.fromEntries(accounts.map(a => [a.id, a]))
  const positions    = accounts.flatMap(acc => {
    const pos = getPositions(acc.id).find(p => p.ticker === norm)
    return pos ? [{ account: acc, pos }] : []
  })

  const actionBalances  = actionAccountId ? getCashBalances(actionAccountId) : []
  const actionPositions = actionAccountId ? getPositions(actionAccountId) : []

  const holdingAccountIds = new Set(positions.map(({ account }) => account.id))

  function openAction(kind) {
    const eligible = kind === 'sell'
      ? accounts.filter(a => holdingAccountIds.has(a.id))
      : accounts
    const pool = eligible.length > 0 ? eligible : accounts
    if (pool.length === 0) return
    if (pool.length === 1) {
      setActionAccountId(pool[0].id)
      setActionForm(kind)
    } else {
      setPickingAccount(kind)
    }
  }

  function closeAction() {
    setActionForm(null)
    setActionAccountId(null)
  }

  async function handleActionBuy(params) {
    const accId = actionAccountId
    const exchangeRates = await snapshotFxRates(params.currency, params.date, getMainCurrency())
    const cost = Number(params.shares) * Number(params.price) + Number(params.fee || 0)
    const existing = getCashBalanceByCurrency(accId, params.currency)
    const currentBal = existing ? getCurrentBalance(existing.id) : 0
    const proceed = () => {
      createBuy({ ...params, investingAccountId: accId, exchangeRates })
      closeAction()
    }
    if (currentBal - cost < 0) {
      setActionNegConfirm({
        message: `This will take your ${params.currency} balance from ${fmtAmt(currentBal)} to ${fmtAmt(currentBal - cost)}.`,
        onConfirm: () => { proceed(); setActionNegConfirm(null) },
      })
    } else {
      proceed()
    }
  }

  async function handleActionSell(params) {
    const accId = actionAccountId
    const exchangeRates = await snapshotFxRates(params.currency, params.date, getMainCurrency())
    createSell({ ...params, investingAccountId: accId, exchangeRates })
    closeAction()
  }

  function handleActionDividend(params) {
    createDividend(params)
    closeAction()
  }

  const stockTxns = getStockTransactionsByTicker(norm)
  const dividends = getDividendsByTicker(norm)
  const currency  = stockTxns[0]?.currency ?? dividends[0]?.currency ?? ''

  const allTxns = [
    ...stockTxns.map(t => ({ ...t, _kind: t.type })),
    ...dividends.map(d => ({ ...d, _kind: 'dividend', date: d.payoutDate })),
  ].sort((a, b) => b.date.localeCompare(a.date) || new Date(b.createdAt) - new Date(a.createdAt))

  const filteredTxns = txFilter === 'all'
    ? allTxns
    : allTxns.filter(t => t._kind === txFilter)

  const allAssignments = getAllPortfolioAssignments()
  const allPortfolios  = getPortfolios()
  const myAssignments  = allAssignments.filter(a => a.ticker === norm)

  const FILTERS = ['all', 'buy', 'sell', 'transfer', 'split', 'dividend', 'currency-exchange']
  const FILTER_LABELS = { all: 'All', buy: 'Buy', sell: 'Sell', transfer: 'Transfer', split: 'Split', dividend: 'Dividend', 'currency-exchange': 'FX' }

  // ── Return metrics ──────────────────────────────────────────────────────────
  // Effective price source priority: per-stock manual override > manual-stock latest > live API price.
  const effectivePrice = manualPrice
    ? { price: manualPrice.amount, currency: manualPrice.currency }
    : latestManualStock
      ? { price: latestManualStock.price, currency: latestManualStock.currency }
      : livePrice ?? null
  const totalShares         = positions.reduce((s, { pos }) => s + pos.shares, 0)
  const posCurrency         = positions[0]?.pos.currency ?? null
  const totalInvestedNative = positions.reduce((s, { pos }) => s + pos.shares * pos.avgCost, 0)
  const marketValueNative   = effectivePrice != null ? totalShares * effectivePrice.price : null
  const priceCurrency       = effectivePrice?.currency ?? posCurrency
  const tradingCurrency     = priceCurrency ?? posCurrency ?? currency ?? ''
  const displayCurrency     = currencyMode === 'trading' ? tradingCurrency : mainCurrency

  const marketValueDisplay = currencyMode === 'trading'
    ? marketValueNative
    : (marketValueNative != null && priceCurrency) ? (convertToMain(marketValueNative, priceCurrency, mainCurrency) ?? null) : null

  const totalInvestedDisplay = currencyMode === 'trading'
    ? totalInvestedNative
    : posCurrency ? (convertToMain(totalInvestedNative, posCurrency, mainCurrency) ?? null) : null

  // Dividend returns must be computed first — totalReturn depends on divNetDisplay.
  const cutoff12m = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10) })()
  let divGrossDisplay = 0, divNetDisplay = 0, div12mGrossDisplay = 0, div12mNetDisplay = 0
  for (const d of dividends) {
    const { totalBeforeTax, netTotal } = computeDividendDerived(d)
    const toDisp = v => currencyMode === 'trading' ? v : (convertToMain(v, d.currency, mainCurrency) ?? 0)
    divGrossDisplay   += toDisp(totalBeforeTax)
    divNetDisplay     += toDisp(netTotal)
    if (d.payoutDate >= cutoff12m) {
      div12mGrossDisplay += toDisp(totalBeforeTax)
      div12mNetDisplay   += toDisp(netTotal)
    }
  }
  // Total return = price appreciation + net dividends received
  const totalReturnDisplay    = (marketValueDisplay != null && totalInvestedDisplay != null) ? marketValueDisplay - totalInvestedDisplay + divNetDisplay : null
  const totalReturnPctDisplay = (totalReturnDisplay != null && totalInvestedDisplay != null && totalInvestedDisplay > 0) ? (totalReturnDisplay / totalInvestedDisplay) * 100 : null
  const priceAppDisplay       = totalReturnDisplay != null ? totalReturnDisplay - divNetDisplay : null

  // divHistoryKey bump (from Refresh dividends) triggers a re-render so this stays fresh.
  const apiHistory = getApiDividendHistoryForTicker(norm) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Merged past payouts (item 313) ───────────────────────────────────────
  // User records + API-only records, deduped by exDate (user wins).
  const mergedPayouts = (() => {
    const userExDates = new Set(dividends.map(d => d.exDividendDate).filter(Boolean))
    const rows = []
    for (const d of dividends) {
      rows.push({ sortDate: d.exDividendDate || d.payoutDate, source: 'user', record: d })
    }
    for (const r of apiHistory) {
      if (!userExDates.has(r.exDate)) {
        rows.push({ sortDate: r.exDate, source: 'api', record: r })
      }
    }
    return rows.sort((a, b) => b.sortDate.localeCompare(a.sortDate))
  })()

  const payoutYears       = [...new Set(mergedPayouts.map(r => r.sortDate.slice(0, 4)))].sort().reverse()
  const payoutsToShow     = mergedPayouts.filter(r => {
    const idx = payoutYears.indexOf(r.sortDate.slice(0, 4))
    return idx < payoutChunksVisible
  })
  const hasMorePayouts    = payoutChunksVisible < payoutYears.length

  // Auto-load more year chunks when current content doesn't fill the scrollable container,
  // so the scroll-trigger lazy-load is always reachable.
  useEffect(() => {
    if (!hasMorePayouts) return
    const el = payoutListRef.current
    if (!el) return
    if (el.scrollHeight - el.clientHeight < 40) {
      setPayoutChunksVisible(n => n + 1)
    }
  }, [payoutChunksVisible, hasMorePayouts, mergedPayouts.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Yield denominators ────────────────────────────────────────────────────
  // Price-based yields use the current market price.
  // Cost-based yields ("yield on cost") use the weighted-average fee-inclusive cost per share.
  const avgCostPerShare = totalShares > 0 ? totalInvestedNative / totalShares : null

  // ── TTM yield — API-sourced with user-record gap-fill (item 306) ─────────
  // ttmYieldData carries the breakdown so the info popup can show every record used.
  const ttmYieldData = (() => {
    const today = new Date().toISOString().slice(0, 10)
    const apiIn12m = apiHistory.filter(r => r.exDate >= cutoff12m && r.exDate <= today)
    const apiExDates = new Set(apiIn12m.map(r => r.exDate))
    const userGap = dividends.filter(d =>
      d.exDividendDate && d.exDividendDate >= cutoff12m && d.exDividendDate <= today && !apiExDates.has(d.exDividendDate)
    )
    const breakdown = [
      ...apiIn12m.map(r => ({ date: r.exDate, perShare: r.perShare ?? 0, type: r.type ?? 'regular', source: 'API', currency: r.currency })),
      ...userGap.map(d => ({ date: d.exDividendDate, perShare: d.dividendPerShare ?? 0, type: d.type ?? 'regular', source: 'user (gap-fill)', currency: d.currency })),
    ].sort((a, b) => b.date.localeCompare(a.date))
    const sumPerShare = breakdown.reduce((s, r) => s + r.perShare, 0)
    return { breakdown, sumPerShare, cutoff: cutoff12m, today }
  })()

  const ttmYieldPctOnPrice = (effectivePrice?.price > 0 && ttmYieldData.sumPerShare > 0)
    ? (ttmYieldData.sumPerShare / effectivePrice.price) * 100 : null
  const ttmYieldPctOnCost = (avgCostPerShare > 0 && ttmYieldData.sumPerShare > 0)
    ? (ttmYieldData.sumPerShare / avgCostPerShare) * 100 : null

  // ── Forward yield (item 307) ─────────────────────────────────────────────
  const FREQ_MULTIPLIER = { monthly: 12, quarterly: 4, 'semi-annual': 2, annual: 1 }
  const effectiveFrequency = detectEffectiveDividendFrequency(
    profile?.dividendFrequency ?? 'unknown',
    { apiHistory, userDividends: dividends }
  )
  const forwardYieldData = (() => {
    if (!effectiveFrequency || effectiveFrequency === 'unknown') return null
    const multiplier = FREQ_MULTIPLIER[effectiveFrequency]
    if (!multiplier) return null
    const today = new Date().toISOString().slice(0, 10)
    // Merged map of past regular payouts: exDate → { perShare, source, currency }
    // User records win on collision (matches forward-yield spec).
    const merged = new Map()
    for (const r of apiHistory) {
      if (r.exDate <= today && (r.type == null || r.type === 'regular')) {
        merged.set(r.exDate, { perShare: r.perShare, source: 'API', currency: r.currency })
      }
    }
    for (const d of dividends) {
      if (d.exDividendDate && d.exDividendDate <= today && (d.type == null || d.type === 'regular')) {
        merged.set(d.exDividendDate, { perShare: d.dividendPerShare, source: 'user', currency: d.currency })
      }
    }
    const sortedKeys = [...merged.keys()].filter(k => k <= today).sort().reverse()
    if (sortedKeys.length === 0) return null
    const lastDate = sortedKeys[0]
    const last = merged.get(lastDate)
    if (!last.perShare || last.perShare <= 0) return null
    return { lastDate, perShare: last.perShare, source: last.source, frequency: effectiveFrequency, multiplier, currency: last.currency }
  })()

  const forwardYieldPctOnPrice = (forwardYieldData && effectivePrice?.price > 0)
    ? (forwardYieldData.perShare * forwardYieldData.multiplier / effectivePrice.price) * 100 : null
  const forwardYieldPctOnCost = (forwardYieldData && avgCostPerShare > 0)
    ? (forwardYieldData.perShare * forwardYieldData.multiplier / avgCostPerShare) * 100 : null

  // ── XIRR p.a. return (item 309) ──────────────────────────────────────────
  // Cash flows: buys/sells (snapshot FX) + dividends (live FX) + terminal MV.
  // Shows "—" when any buy/sell lacks a snapshot and trading ≠ main currency.
  const xirrPct = (() => {
    if (marketValueNative == null) return null
    const crossCurrency = tradingCurrency && tradingCurrency !== mainCurrency
    const cashFlows = []

    for (const txn of stockTxns) {
      if (txn.type !== 'buy' && txn.type !== 'sell') continue
      const tradingAmt = txn.type === 'buy'
        ? -(txn.shares * txn.price + (txn.fee ?? 0))
        : txn.shares * txn.price - (txn.fee ?? 0)
      let mainAmt
      if (!crossCurrency) {
        mainAmt = tradingAmt
      } else {
        const snap = txn.exchangeRates?.rateToMain
        if (snap) {
          mainAmt = tradingAmt * snap
        } else {
          // No historical snapshot — fall back to live rate (less accurate for old transactions)
          const converted = convertToMain(tradingAmt, tradingCurrency, mainCurrency)
          if (converted == null) return null
          mainAmt = converted
        }
      }
      cashFlows.push({ date: txn.date, amount: mainAmt })
    }

    // Dividends: use live rate (no per-dividend snapshot available)
    for (const d of dividends) {
      const { netTotal } = computeDividendDerived(d)
      const mainAmt = d.currency === mainCurrency
        ? netTotal
        : convertToMain(netTotal, d.currency, mainCurrency)
      if (mainAmt != null) cashFlows.push({ date: d.payoutDate, amount: mainAmt })
    }

    if (cashFlows.length === 0) return null

    // Terminal value: current market value in main currency at today
    const terminalMv = !crossCurrency
      ? marketValueNative
      : convertToMain(marketValueNative, tradingCurrency, mainCurrency)
    if (terminalMv == null) return null
    cashFlows.push({ date: new Date().toISOString().slice(0, 10), amount: terminalMv })

    const rate = computeXirr(cashFlows)
    return rate != null ? rate * 100 : null
  })()

  // ── Dividend projections + future payouts (item 316 / Phase 28f) ────────────
  const globalEstRule = getDividendEstimationRule()
  const effectiveRule = profile?.amountEstimationRule ?? globalEstRule
  const projTaxPct    = resolveDividendTaxPercent(norm)

  // Merge API past-history into the user dividends dataset for cadence/amount
  // estimation (item 319). User records win on exDate collision; specials are
  // excluded by computeProjections internally, so we only add regular API records.
  const mergedDividendsForProjections = (() => {
    const today = new Date().toISOString().slice(0, 10)
    const userExDates = new Set(dividends.map(d => d.exDividendDate).filter(Boolean))
    const apiPast = apiHistory
      .filter(r => (r.type == null || r.type === 'regular') && r.exDate <= today && !userExDates.has(r.exDate))
      .map(r => ({
        payoutDate: r.payDate ?? r.exDate,
        exDividendDate: r.exDate,
        dividendPerShare: r.perShare,
        currency: r.currency,
        type: 'regular',
      }))
    return [...dividends, ...apiPast].sort((a, b) => (b.payoutDate ?? '').localeCompare(a.payoutDate ?? ''))
  })()

  const estimatedProjections = totalShares > 0
    ? computeProjections(mergedDividendsForProjections, { rule: effectiveRule, manualAmount: profile?.manualEstimatedAmount ?? null })
    : []

  // Most-recent regular per-share for standalone + Declare dialog defaults.
  const lastRegularPerShare = (() => {
    const today = new Date().toISOString().slice(0, 10)
    const userRegular = dividends.filter(d => d.type == null || d.type === 'regular')
    if (userRegular.length > 0) return userRegular[0].dividendPerShare
    const apiRegular = apiHistory
      .filter(r => (r.type == null || r.type === 'regular') && r.exDate <= today)
      .sort((a, b) => b.exDate.localeCompare(a.exDate))
    return apiRegular[0]?.perShare ?? null
  })()
  const declareDefaultCurrency = currency || dividends[0]?.currency || apiHistory.find(r => r.currency)?.currency || ''

  // Merge declared-future records from apiDividendHistory with estimated projections.
  // Declared records (including specials) render as-is; estimated slots fill the rest.
  // An estimated date is suppressed when any declared record falls within 14 days.
  const futurePayouts = (() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const declared = apiHistory
      .filter(r => r.state === 'declared' && r.exDate > todayStr)
      .sort((a, b) => a.exDate.localeCompare(b.exDate))

    const items = declared.map(r => ({
      exDate: r.exDate, payDate: r.payDate, perShare: r.perShare,
      currency: r.currency, type: r.type, state: 'declared', source: r.source,
    }))

    for (const e of estimatedProjections) {
      const near = declared.some(d => {
        const diffMs = Math.abs(new Date(d.exDate) - new Date(e.date))
        return diffMs < 14 * 24 * 3600 * 1000
      })
      if (!near) {
        items.push({
          exDate: e.date, payDate: null, perShare: e.dividendPerShare,
          currency: e.currency, type: 'regular', state: 'estimated', cadenceLabel: e.cadenceLabel,
        })
      }
    }

    return items.sort((a, b) => a.exDate.localeCompare(b.exDate)).slice(0, 4)
  })()

  // ── Portfolio % share (item 312) ────────────────────────────────────────────
  // For each portfolio this stock belongs to: % share = this position MV / portfolio total MV.
  // Fetches prices for all other tickers in the portfolio from cache (no force-refresh).
  useEffect(() => {
    if (!myAssignments.length || !effectivePrice || totalShares <= 0) {
      setPortfolioMvPcts({})
      return
    }
    let cancelled = false
    async function compute() {
      const portfolioIds = [...new Set(myAssignments.map(a => a.portfolioId))]
      const results = {}
      for (const pid of portfolioIds) {
        const portAssignments = allAssignments.filter(a => a.portfolioId === pid)
        const uniqueTickers   = [...new Set(portAssignments.map(a => a.ticker))]
        const priceMap = {}
        await Promise.all(uniqueTickers.map(async t => {
          try {
            const prof = getStockProfile(t)
            priceMap[t] = await getLatestPrice(t, prof?.stockExchange ?? null)
          } catch { priceMap[t] = null }
        }))
        let portfolioTotalMvMain = 0
        let thisTickerMvMain    = 0
        for (const t of uniqueTickers) {
          const tickerPrice  = t === norm ? effectivePrice : priceMap[t]
          if (!tickerPrice) continue
          const tickerShares = t === norm
            ? totalShares
            : accounts.reduce((s, acc) => {
                const pos = getPositions(acc.id).find(p => p.ticker === t)
                return s + (pos ? pos.shares : 0)
              }, 0)
          const mvNative = tickerShares * tickerPrice.price
          const mvMain   = convertToMain(mvNative, tickerPrice.currency, mainCurrency) ?? 0
          portfolioTotalMvMain += mvMain
          if (t === norm) thisTickerMvMain = mvMain
        }
        results[pid] = portfolioTotalMvMain > 0
          ? (thisTickerMvMain / portfolioTotalMvMain) * 100
          : null
      }
      if (!cancelled) setPortfolioMvPcts(results)
    }
    compute()
    return () => { cancelled = true }
  }, [norm, effectivePrice?.price, totalShares, ratesVersion, allAssignments.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-read on every render; divHistoryKey bump causes a re-render so isStale stays fresh
  const isStale = isStaleForTicker(norm)

  function handleCurrencyModeChange(mode) {
    setCurrencyMode(mode)
    localStorage.setItem('rmoney_currency_toggle_stock', mode)
  }

  async function handleRefreshDividends() {
    setDivRefreshStatus('loading')
    try {
      await refreshApiDividendHistory(norm, profile?.stockExchange ?? null)
      setDivRefreshStatus('idle')
    } catch {
      setDivRefreshStatus('failed')
    } finally {
      setDivHistoryKey(k => k + 1)
    }
  }

  function handleRuleChange(rule) {
    upsertStockProfile(norm, { amountEstimationRule: rule })
    setProfileKey(k => k + 1)
  }

  function handleManualAmtSave(value) {
    const n = Number(value)
    if (!isNaN(n) && n >= 0) {
      upsertStockProfile(norm, { manualEstimatedAmount: n || null })
      setProfileKey(k => k + 1)
    }
  }

  function handleApplySplit() {
    setSplitError('')
    try {
      applySplit({ ticker: norm, date: splitDate, numerator: splitNum, denominator: splitDen })
      setSplitFormOpen(false)
      setSplitNum('2'); setSplitDen('1')
    } catch (err) {
      setSplitError(err.message)
    }
  }

  return (
    <div className={styles.screen}>

      {/* Header — full width */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>←</button>
        <span className={styles.headerTicker}>{norm}</span>
        {profile?.name && <span className={styles.headerName}>{profile.name}</span>}
        {profile?.stockExchange && <span className={styles.headerCurrency}>{profile.stockExchange}</span>}
        {currency && !profile?.stockExchange && <span className={styles.headerCurrency}>{currency}</span>}
        {accounts.length > 0 && <>
          <button className={styles.buyBtn}      onClick={() => openAction('buy')}>+ Buy</button>
          <button className={styles.sellBtn}     onClick={() => openAction('sell')}>+ Sell</button>
          <button className={styles.dividendBtn} onClick={() => openAction('dividend')}>+ Dividend</button>
        </>}
        {!isManualStockProfile && (
          <button
            className={styles.profileBtn}
            onClick={() => setResolving(true)}
            title={profile?.name ? 'Refresh profile' : 'Resolve profile'}
          >
            {profile?.name ? 'Refresh profile' : 'Resolve profile'}
          </button>
        )}
        <button
          className={styles.profileBtn}
          onClick={() => setEditingProfile(true)}
          title="Edit profile fields manually"
        >
          Edit profile
        </button>
        <button
          className={styles.profileBtn}
          onClick={() => setRenaming(true)}
          title="Rename ticker"
        >
          Rename ticker
        </button>
        {!isManualStockProfile && (
          <button
            className={styles.profileBtn}
            onClick={handleRefreshDividends}
            disabled={divRefreshStatus === 'loading'}
            title="Fetch dividend history from market data providers"
          >
            {divRefreshStatus === 'loading' ? 'Refreshing…' : 'Refresh dividends'}
          </button>
        )}
        {!isManualStockProfile && isStale && (
          <span
            className={styles.staleDot}
            title="Dividend data is missing or outdated — click Refresh dividends"
          >
            ●
          </span>
        )}
        {divRefreshStatus === 'failed' && (
          <span className={styles.divRefreshError}>Refresh failed</span>
        )}
        {tradingCurrency && tradingCurrency !== mainCurrency && (
          <CurrencyToggle
            value={currencyMode}
            onChange={handleCurrencyModeChange}
            tradingCurrency={tradingCurrency}
            mainCurrency={mainCurrency}
          />
        )}
      </div>

      {/* Price row */}
      <div className={styles.manualPriceRow}>
        {isManualStockProfile ? (
          <>
            <span className={styles.manualStockBadge} title="No API data — prices are entered by you">Manual stock</span>
            {latestManualStock ? (
              <>
                <span className={styles.manualPriceLabel}>Price:</span>
                <span className={styles.manualPriceValue}>{fmtAmt(latestManualStock.price)} {latestManualStock.currency}</span>
                <span className={styles.priceSource}>as of {latestManualStock.date}</span>
              </>
            ) : (
              <span className={styles.priceUnavailable}>No price set yet</span>
            )}
            <button
              className={styles.manualPriceBtn}
              onClick={() => setManualStockForm({
                date: new Date().toISOString().slice(0, 10),
                amount: '',
                currency: latestManualStock?.currency ?? profile?.currency ?? 'USD',
              })}
            >
              {latestManualStock ? 'Set price' : 'Set first price'}
            </button>
            {getManualPricesForTicker(norm).length > 0 && (
              <button className={styles.manualPriceBtn} onClick={() => setManualStockListOpen(o => !o)}>
                {manualStockListOpen ? 'Hide history' : 'Price history'}
              </button>
            )}
          </>
        ) : manualPrice ? (
          <>
            <span className={styles.manualPriceLabel}>Price (manual):</span>
            <span className={styles.manualPriceValue}>{fmtAmt(manualPrice.amount)} {manualPrice.currency}</span>
            <button className={styles.manualPriceBtn} onClick={() => setManualPriceForm({ amount: String(manualPrice.amount), currency: manualPrice.currency })}>
              Edit
            </button>
            <button className={styles.manualPriceClearBtn} onClick={() => { clearManualPrice(norm); setManualPriceKey(k => k + 1); fetchPrice() }}>
              Clear manual price
            </button>
          </>
        ) : livePrice ? (
          <>
            <span className={styles.manualPriceLabel}>Price:</span>
            <span className={styles.manualPriceValue}>{fmtAmt(livePrice.price)} {livePrice.currency ?? ''}</span>
            <span className={styles.priceSource}>via {livePrice.providerName}</span>
            <button className={styles.manualPriceBtn} onClick={() => fetchPrice(true)} disabled={priceStatus === 'loading'}>
              {priceStatus === 'loading' ? 'Refreshing…' : 'Refresh'}
            </button>
            <button className={styles.manualPriceBtn} onClick={() => setManualPriceForm({ amount: '', currency: livePrice.currency ?? profile?.currency ?? currency ?? '' })}>
              Set manual price
            </button>
          </>
        ) : (
          <>
            {priceStatus === 'loading' && <span className={styles.priceLoading}>Loading price…</span>}
            {priceStatus === 'unavailable' && <span className={styles.priceUnavailable}>Price unavailable</span>}
            {priceStatus === 'idle' && <span className={styles.priceUnavailable}>No price data</span>}
            <button className={styles.manualPriceBtn} onClick={() => setManualPriceForm({ amount: '', currency: profile?.currency ?? currency ?? '' })}>
              Set manual price
            </button>
          </>
        )}
      </div>

      {manualPriceForm && (
        <div className={styles.manualPriceForm}>
          <input
            className={styles.manualPriceInput}
            type="number"
            min="0"
            step="any"
            value={manualPriceForm.amount}
            placeholder="Price"
            onChange={e => setManualPriceForm(f => ({ ...f, amount: e.target.value }))}
            autoFocus
          />
          <input
            className={styles.manualPriceCurrencyInput}
            value={manualPriceForm.currency}
            placeholder="USD"
            maxLength={4}
            onChange={e => setManualPriceForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))}
          />
          <button
            className={styles.manualPriceSaveBtn}
            disabled={!manualPriceForm.amount || !manualPriceForm.currency}
            onClick={() => {
              setManualPrice(norm, manualPriceForm.amount, manualPriceForm.currency)
              setManualPriceKey(k => k + 1)
              setManualPriceForm(null)
            }}
          >
            Save
          </button>
          <button className={styles.manualPriceCancelBtn} onClick={() => setManualPriceForm(null)}>
            Cancel
          </button>
        </div>
      )}

      {/* Manual-stock price-entry form (Phase 32e) — accepts date + price + currency. */}
      {manualStockForm && (
        <div className={styles.manualPriceForm}>
          <input
            className={styles.manualPriceInput}
            type="date"
            value={manualStockForm.date}
            onChange={e => setManualStockForm(f => ({ ...f, date: e.target.value }))}
            style={{ minWidth: 140 }}
          />
          <input
            className={styles.manualPriceInput}
            type="number"
            min="0"
            step="any"
            value={manualStockForm.amount}
            placeholder="Price"
            onChange={e => setManualStockForm(f => ({ ...f, amount: e.target.value }))}
            autoFocus
          />
          <input
            className={styles.manualPriceCurrencyInput}
            value={manualStockForm.currency}
            placeholder="USD"
            maxLength={4}
            onChange={e => setManualStockForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))}
          />
          <button
            className={styles.manualPriceSaveBtn}
            disabled={!manualStockForm.date || !manualStockForm.amount || !manualStockForm.currency}
            onClick={() => {
              setManualPriceEntry(norm, manualStockForm.date, manualStockForm.amount, manualStockForm.currency)
              setManualStockForm(null)
              setManualPriceKey(k => k + 1)
            }}
          >
            Save
          </button>
          <button className={styles.manualPriceCancelBtn} onClick={() => setManualStockForm(null)}>
            Cancel
          </button>
        </div>
      )}

      {/* Manual-stock price history (Phase 32e) — collapsed by default. */}
      {isManualStockProfile && manualStockListOpen && (
        <div className={styles.manualStockHistory}>
          {getManualPricesForTicker(norm).map(row => (
            <div key={row.date} className={styles.manualStockHistoryRow}>
              <span className={styles.manualStockHistoryDate}>{row.date}</span>
              <span className={styles.manualStockHistoryPrice}>{fmtAmt(row.price)} {row.currency}</span>
              <button
                className={styles.manualPriceBtn}
                onClick={() => setManualStockForm({ date: row.date, amount: String(row.price), currency: row.currency })}
              >Edit</button>
              <button
                className={styles.manualPriceClearBtn}
                onClick={() => { deleteManualPriceEntry(norm, row.date); setManualPriceKey(k => k + 1) }}
              >Delete</button>
            </div>
          ))}
        </div>
      )}

      {resolving && (
        <StockProfileResolutionDialog
          ticker={norm}
          direction="A"
          onConfirm={() => { setResolving(false); setProfileKey(k => k + 1) }}
          onCancel={() => setResolving(false)}
        />
      )}

      {renaming && (
        <TickerRenameDialog
          oldTicker={norm}
          onConfirm={(newTicker, resolvedFields, mode) => {
            renameTicker(norm, newTicker, resolvedFields, mode)
            setRenaming(false)
            onNavigate('stock', { ticker: newTicker })
          }}
          onCancel={() => setRenaming(false)}
        />
      )}

      {editingProfile && (
        <EditProfileDialog
          ticker={norm}
          profile={profile}
          onSave={fields => {
            upsertStockProfile(norm, { ...fields, confirmed: true, confirmedAt: new Date().toISOString() })
            setEditingProfile(false)
            setProfileKey(k => k + 1)
          }}
          onCancel={() => setEditingProfile(false)}
        />
      )}

      {editingSplitTx && (
        <EditSplitDialog
          txn={editingSplitTx}
          onSave={({ date, numerator, denominator }) => {
            updateSplit(editingSplitTx.id, { date, numerator, denominator })
            setEditingSplitTx(null)
          }}
          onCancel={() => setEditingSplitTx(null)}
        />
      )}

      {yieldDetailKind && (
        <YieldDetailDialog
          kind={yieldDetailKind}
          ttmData={ttmYieldData}
          forwardData={forwardYieldData}
          price={effectivePrice?.price ?? null}
          avgCost={avgCostPerShare}
          tradingCurrency={tradingCurrency}
          onClose={() => setYieldDetailKind(null)}
        />
      )}

      {editingDividend && (
        <EditDividendDialog
          dividend={editingDividend}
          onSave={fields => {
            updateDividend(editingDividend.id, fields)
            setEditingDividend(null)
          }}
          onCancel={() => setEditingDividend(null)}
        />
      )}

      {convertingEstimated && (
        <ConvertToDeclaredDialog
          defaultExDate={convertingEstimated.exDate}
          defaultPerShare={convertingEstimated.perShare}
          defaultCurrency={convertingEstimated.currency}
          ticker={norm}
          onSave={({ exDate, payDate, perShare, currency }) => {
            upsertApiDividends(norm, [{
              ticker: norm,
              exDate,
              payDate: payDate || null,
              perShare: Number(perShare),
              currency,
              type: 'regular',
              state: 'declared',
              source: 'manual',
              fetchedAt: new Date().toISOString(),
            }])
            setConvertingEstimated(null)
            setDivHistoryKey(k => k + 1)
          }}
          onCancel={() => setConvertingEstimated(null)}
        />
      )}

      {declaringNew && (
        <ConvertToDeclaredDialog
          defaultExDate=""
          defaultPerShare={lastRegularPerShare ?? ''}
          defaultCurrency={declareDefaultCurrency}
          isNew
          ticker={norm}
          onSave={({ exDate, payDate, perShare, currency }) => {
            upsertApiDividends(norm, [{
              ticker: norm,
              exDate,
              payDate: payDate || null,
              perShare: Number(perShare),
              currency,
              type: 'regular',
              state: 'declared',
              source: 'manual',
              fetchedAt: new Date().toISOString(),
            }])
            setDeclaringNew(false)
            setDivHistoryKey(k => k + 1)
          }}
          onCancel={() => setDeclaringNew(false)}
        />
      )}

      {/* Account picker — shown when multiple accounts are eligible */}
      {pickingAccount && (
        <div className={styles.formOverlay}>
          <div className={styles.accountPickerDialog}>
            <h3 className={styles.accountPickerTitle}>
              Select account for {pickingAccount === 'buy' ? 'Buy' : pickingAccount === 'sell' ? 'Sell' : 'Dividend'}
            </h3>
            <div className={styles.accountPickerList}>
              {(pickingAccount === 'sell'
                ? accounts.filter(a => holdingAccountIds.has(a.id)).length > 0
                  ? accounts.filter(a => holdingAccountIds.has(a.id))
                  : accounts
                : accounts
              ).map(acc => (
                <button
                  key={acc.id}
                  className={styles.accountPickerBtn}
                  onClick={() => {
                    setActionAccountId(acc.id)
                    setActionForm(pickingAccount)
                    setPickingAccount(null)
                  }}
                >
                  <span className={styles.accountPickerName}>{acc.name}</span>
                  {acc.institution && <span className={styles.accountPickerInst}>{acc.institution}</span>}
                </button>
              ))}
            </div>
            <button className={styles.accountPickerCancel} onClick={() => setPickingAccount(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Buy / Sell / Dividend form overlay */}
      {actionForm && actionAccountId && (
        <div className={styles.formOverlay}>
          <div className={styles.formOverlayInner}>
            {actionForm === 'buy' && (
              <BuyForm
                balances={actionBalances}
                initialTicker={norm}
                tickerLocked={true}
                onSave={handleActionBuy}
                onCancel={closeAction}
              />
            )}
            {actionForm === 'sell' && (
              <SellForm
                accountId={actionAccountId}
                positions={actionPositions}
                defaultTicker={norm}
                tickerLocked={true}
                onSave={handleActionSell}
                onCancel={closeAction}
              />
            )}
            {actionForm === 'dividend' && (
              <DividendForm
                accountId={actionAccountId}
                positions={actionPositions}
                defaultTicker={norm}
                tickerLocked={true}
                onSave={handleActionDividend}
                onCancel={closeAction}
              />
            )}
          </div>
        </div>
      )}

      {/* Negative-balance confirmation */}
      {actionNegConfirm && (
        <div className={styles.formOverlay}>
          <div className={styles.negConfirmDialog}>
            <h3 className={styles.negConfirmTitle}>⚠ Negative balance</h3>
            <p className={styles.negConfirmMsg}>{actionNegConfirm.message}</p>
            <p className={styles.negConfirmMsg}>Do you want to proceed?</p>
            <div className={styles.negConfirmActions}>
              <button className={styles.negCancelBtn} onClick={() => setActionNegConfirm(null)}>Cancel</button>
              <button className={styles.negProceedBtn} onClick={actionNegConfirm.onConfirm}>Proceed</button>
            </div>
          </div>
        </div>
      )}

      {/* Body — two columns on desktop */}
      <div className={styles.body}>

        {/* Left column: stock data */}
        <div className={styles.leftCol}>

          {/* Price chart */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Price chart</span>
              <div className={styles.chartPeriodBar}>
                {['1D', '1M', '3M', '6M', '1Y', '5Y', 'All'].map(p => {
                  const disabled = p === '1D' && intradayUnsupported === true
                  const btn = (
                    <button
                      key={p}
                      className={`${styles.chartPeriodBtn} ${chartPeriod === p ? styles.chartPeriodBtnActive : ''}`}
                      onClick={() => setChartPeriod(p)}
                      disabled={disabled}
                    >{p}</button>
                  )
                  return disabled
                    ? <span key={p} title="Intraday data not available for this stock">{btn}</span>
                    : btn
                })}
              </div>
            </div>
            <PriceChart data={chartData} status={chartStatus} isIntraday={chartPeriod === '1D'} />
          </div>

          {/* Positions */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Positions</span>
              {positions.length > 0 && !splitFormOpen && (
                <button className={styles.actionBtn} onClick={() => setSplitFormOpen(true)}>+ Split</button>
              )}
            </div>
            {splitFormOpen && (
              <div className={styles.splitForm}>
                <div className={styles.splitFormRow}>
                  <label className={styles.splitLabel}>Effective date</label>
                  <input
                    type="date"
                    className={styles.splitInput}
                    value={splitDate}
                    onChange={e => setSplitDate(e.target.value)}
                  />
                </div>
                <div className={styles.splitFormRow}>
                  <label className={styles.splitLabel}>Ratio</label>
                  <input
                    type="number"
                    className={styles.splitInputNarrow}
                    value={splitNum}
                    min="0"
                    step="any"
                    onChange={e => setSplitNum(e.target.value)}
                  />
                  <span className={styles.splitSep}>for every</span>
                  <input
                    type="number"
                    className={styles.splitInputNarrow}
                    value={splitDen}
                    min="0"
                    step="any"
                    onChange={e => setSplitDen(e.target.value)}
                  />
                  <span className={styles.splitSep}>old shares</span>
                </div>
                <p className={styles.splitHint}>
                  {splitNum && splitDen && Number(splitDen) > 0
                    ? Number(splitNum) > Number(splitDen)
                      ? `Forward split — your shares scale by ${(Number(splitNum) / Number(splitDen)).toFixed(4).replace(/\.?0+$/, '')}×`
                      : Number(splitNum) < Number(splitDen)
                        ? `Reverse split — your shares scale by ${(Number(splitNum) / Number(splitDen)).toFixed(4).replace(/\.?0+$/, '')}×`
                        : 'No effect (1:1 ratio)'
                    : ''}
                </p>
                {splitError && <p className={styles.splitErrorMsg}>{splitError}</p>}
                <div className={styles.splitActions}>
                  <button className={styles.splitCancelBtn} onClick={() => { setSplitFormOpen(false); setSplitError('') }}>Cancel</button>
                  <button className={styles.splitApplyBtn} onClick={handleApplySplit}>Apply</button>
                </div>
              </div>
            )}
            {positions.length === 0 ? (
              <p className={styles.empty}>No open positions.</p>
            ) : (
              <div className={styles.positionTable}>
                {positions.map(({ account, pos }) => (
                  <div key={account.id} className={styles.positionRow}>
                    <span className={styles.posAccountName}>{account.name}</span>
                    <span className={styles.posShares}>{trimDec(pos.shares)} sh</span>
                    <span className={styles.posAvg}>{fmtAmt(pos.avgCost)} avg</span>
                    <span className={styles.posTotal}>{fmtAmt(pos.shares * pos.avgCost)} {pos.currency}</span>
                  </div>
                ))}
                {positions.length >= 2 && (
                  <div className={`${styles.positionRow} ${styles.positionSubtotal}`}>
                    <span className={styles.posSubtotalLabel}>Total</span>
                    <span className={styles.posShares}>{trimDec(totalShares)} sh</span>
                    <span className={styles.posAvg}>{avgCostPerShare != null ? `${fmtAmt(avgCostPerShare)} avg` : '—'}</span>
                    <span className={styles.posTotal}>
                      {marketValueDisplay != null
                        ? `${fmtAmt(marketValueDisplay)} ${displayCurrency}`
                        : '—'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Returns metrics */}
          {positions.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Returns</div>
              <div className={styles.metricsRow}>
                <div className={styles.metricTile}>
                  <div className={styles.metricLabel}>Market value</div>
                  <div className={styles.metricValue}>
                    {marketValueDisplay != null
                      ? `${fmtAmt(marketValueDisplay)} ${displayCurrency}`
                      : <span className={styles.metricNa}>—</span>}
                  </div>
                </div>
                <div className={styles.metricTile}>
                  <div className={styles.metricLabel}>Total return</div>
                  <div className={`${styles.metricValue} ${totalReturnDisplay != null ? (totalReturnDisplay >= 0 ? styles.pos : styles.neg) : ''}`}>
                    {totalReturnDisplay != null
                      ? `${totalReturnDisplay >= 0 ? '+' : ''}${fmtAmt(Math.abs(totalReturnDisplay))} ${displayCurrency}`
                      : <span className={styles.metricNa}>—</span>}
                  </div>
                  {totalReturnPctDisplay != null && (
                    <div className={`${styles.metricSub} ${totalReturnPctDisplay >= 0 ? styles.pos : styles.neg}`}>
                      {fmtPct(totalReturnPctDisplay)}
                    </div>
                  )}
                </div>
                <div className={styles.metricTile}>
                  <div className={styles.metricLabel}>P.a. return</div>
                  <div className={`${styles.metricValue} ${xirrPct != null ? (xirrPct >= 0 ? styles.pos : styles.neg) : ''}`}>
                    {xirrPct != null
                      ? fmtPct(xirrPct)
                      : <span className={styles.metricNa}>—</span>}
                  </div>
                  {xirrPct != null && <div className={styles.metricSub} style={{ color: '#475569' }}>XIRR</div>}
                </div>
                <div className={styles.metricTile}>
                  <div className={styles.metricLabel}>Price appreciation</div>
                  <div className={`${styles.metricValue} ${priceAppDisplay != null ? (priceAppDisplay >= 0 ? styles.pos : styles.neg) : ''}`}>
                    {priceAppDisplay != null
                      ? `${priceAppDisplay >= 0 ? '+' : ''}${fmtAmt(Math.abs(priceAppDisplay))} ${displayCurrency}`
                      : <span className={styles.metricNa}>—</span>}
                  </div>
                </div>
                <div className={styles.metricTile}>
                  <div className={styles.metricLabel}>Div return (all-time)</div>
                  <div className={`${styles.metricValue} ${divGrossDisplay > 0 ? styles.pos : ''}`}>
                    {divGrossDisplay > 0
                      ? `+${fmtAmt(divGrossDisplay)} ${displayCurrency}`
                      : <span className={styles.metricNa}>—</span>}
                  </div>
                  {divGrossDisplay > 0 && (
                    <div className={styles.metricSub} style={{ color: '#475569' }}>
                      net +{fmtAmt(divNetDisplay)} {displayCurrency}
                    </div>
                  )}
                </div>
                <div className={styles.metricTile}>
                  <div className={styles.metricLabel}>Div return (L12M)</div>
                  <div className={`${styles.metricValue} ${div12mGrossDisplay > 0 ? styles.pos : ''}`}>
                    {div12mGrossDisplay > 0
                      ? `+${fmtAmt(div12mGrossDisplay)} ${displayCurrency}`
                      : <span className={styles.metricNa}>—</span>}
                  </div>
                  {div12mGrossDisplay > 0 && (
                    <div className={styles.metricSub} style={{ color: '#475569' }}>
                      net +{fmtAmt(div12mNetDisplay)} {displayCurrency}
                    </div>
                  )}
                </div>
                <div className={`${styles.metricTile} ${styles.metricTileNarrow}`}>
                  <div className={styles.metricLabel}>
                    <span>TTM yield</span>
                    <button className={styles.infoBtn} onClick={() => setYieldDetailKind('ttm-price')} title="Show calculation">ⓘ</button>
                  </div>
                  <div className={styles.metricValue}>
                    {ttmYieldPctOnPrice != null
                      ? `${ttmYieldPctOnPrice.toFixed(2)}%`
                      : <span className={styles.metricNa}>—</span>}
                  </div>
                  {ttmYieldPctOnPrice != null && <div className={styles.metricSub} style={{ color: '#475569' }}>on price</div>}
                </div>
                <div className={`${styles.metricTile} ${styles.metricTileNarrow}`}>
                  <div className={styles.metricLabel}>
                    <span>TTM on cost</span>
                    <button className={styles.infoBtn} onClick={() => setYieldDetailKind('ttm-cost')} title="Show calculation">ⓘ</button>
                  </div>
                  <div className={styles.metricValue}>
                    {ttmYieldPctOnCost != null
                      ? `${ttmYieldPctOnCost.toFixed(2)}%`
                      : <span className={styles.metricNa}>—</span>}
                  </div>
                  {ttmYieldPctOnCost != null && <div className={styles.metricSub} style={{ color: '#475569' }}>yield on cost</div>}
                </div>
                <div className={`${styles.metricTile} ${styles.metricTileNarrow}`}>
                  <div className={styles.metricLabel}>
                    <span>Fwd yield</span>
                    <button className={styles.infoBtn} onClick={() => setYieldDetailKind('forward-price')} title="Show calculation">ⓘ</button>
                  </div>
                  <div className={styles.metricValue}>
                    {forwardYieldPctOnPrice != null
                      ? `${forwardYieldPctOnPrice.toFixed(2)}%`
                      : <span className={styles.metricNa}>—</span>}
                  </div>
                  {forwardYieldPctOnPrice != null && effectiveFrequency !== 'unknown' && (
                    <div className={styles.metricSub} style={{ color: '#475569' }}>on price · {effectiveFrequency}</div>
                  )}
                </div>
                <div className={`${styles.metricTile} ${styles.metricTileNarrow}`}>
                  <div className={styles.metricLabel}>
                    <span>Fwd on cost</span>
                    <button className={styles.infoBtn} onClick={() => setYieldDetailKind('forward-cost')} title="Show calculation">ⓘ</button>
                  </div>
                  <div className={styles.metricValue}>
                    {forwardYieldPctOnCost != null
                      ? `${forwardYieldPctOnCost.toFixed(2)}%`
                      : <span className={styles.metricNa}>—</span>}
                  </div>
                  {forwardYieldPctOnCost != null && effectiveFrequency !== 'unknown' && (
                    <div className={styles.metricSub} style={{ color: '#475569' }}>on cost · {effectiveFrequency}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Transactions */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Transactions</div>
            <div className={styles.filterBar}>
              {FILTERS.map(f => (
                <button
                  key={f}
                  className={`${styles.filterBtn} ${txFilter === f ? styles.filterBtnActive : ''}`}
                  onClick={() => setTxFilter(f)}
                >
                  {FILTER_LABELS[f]}
                </button>
              ))}
            </div>
            {filteredTxns.length === 0 ? (
              <p className={styles.empty}>No transactions.</p>
            ) : (
              <div className={styles.txList} style={{ maxHeight: '570px', overflowY: 'auto' }}>
                {filteredTxns.map(t => (
                  <TxRow
                    key={t.id}
                    txn={t}
                    accountsById={accountsById}
                    onEditSplit={t._kind === 'split' ? () => setEditingSplitTx(t) : null}
                    mainCurrency={mainCurrency}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Dividends — unified list (items 320-323 / Phase 28f-ii) */}
          {(mergedPayouts.length > 0 || futurePayouts.length > 0 || totalShares > 0) && (
            <div className={styles.section}>

              {/* Header row: title + estimation controls + + Declare button */}
              <div className={styles.divSectionHeader}>
                <span className={styles.sectionTitle}>Dividends</span>
                <div className={styles.divSectionControls}>
                  {estimatedProjections[0]?.cadenceLabel && (
                    <span className={styles.projCadence}>({estimatedProjections[0].cadenceLabel})</span>
                  )}
                  <select
                    className={styles.projRuleSelect}
                    value={effectiveRule}
                    onChange={e => handleRuleChange(e.target.value)}
                  >
                    <option value="last-paid">Last paid</option>
                    <option value="year-ago">Year ago</option>
                    <option value="manual">Manual</option>
                  </select>
                  {effectiveRule === 'manual' && (
                    <input
                      key={norm + '-proj-manual'}
                      className={styles.projManualInput}
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={profile?.manualEstimatedAmount ?? ''}
                      placeholder="per share"
                      onBlur={e => handleManualAmtSave(e.target.value)}
                    />
                  )}
                  <div ref={divColPickerRef} className={styles.divColPickerWrap}>
                    <button
                      className={styles.divColPickerBtn}
                      onClick={() => setDivColPickerOpen(v => !v)}
                      title="Show / hide columns"
                      type="button"
                    >⊞ Columns</button>
                    {divColPickerOpen && (
                      <div className={styles.divColPickerPanel}>
                        <div className={styles.divColPickerTitle}>Visible columns</div>
                        {DIV_COLUMNS.filter(c => c.id !== 'actions' && (!c.conditional || c.conditional === currencyMode)).map(col => (
                          <label key={col.id} className={styles.divColPickerItem}>
                            <input
                              type="checkbox"
                              checked={!divHiddenCols.has(col.id)}
                              disabled={col.mandatory}
                              onChange={() => toggleDivCol(col.id)}
                            />
                            <span>{col.label || col.title}{col.mandatory ? ' (always)' : ''}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className={styles.declareNewBtn}
                    onClick={() => setDeclaringNew(true)}
                    title="Enter a future expected dividend manually"
                  >+ Declare</button>
                </div>
              </div>

              {/* Unified dividend table */}
              {(mergedPayouts.length > 0 || futurePayouts.length > 0) && (() => {
                const visibleCols = DIV_COLUMNS.filter(c =>
                  !divHiddenCols.has(c.id) &&
                  (!c.conditional || c.conditional === currencyMode)
                )
                const futureNormalized = futurePayouts.map((fp, i) => {
                  const isDeclared = fp.state === 'declared'
                  const derived = fp.perShare != null && totalShares > 0
                    ? computeDividendDerived({ dividendPerShare: fp.perShare, shareCount: totalShares, taxPercent: projTaxPct })
                    : null
                  return {
                    key:           `future-${i}`,
                    rowClass:      `${styles.divFutureRow} ${isDeclared ? styles.projRowDeclared : styles.projRowEstimated}`,
                    exDate:        fp.exDate,
                    payDate:       fp.payDate || null,
                    perShareLabel: fp.perShare != null ? `${isDeclared ? '' : '~'}${fmtAmt(fp.perShare)} ${fp.currency ?? ''}` : '—',
                    shares:        totalShares > 0 ? totalShares : null,
                    taxPct:        projTaxPct > 0 ? projTaxPct : null,
                    netLabel:      derived ? `${isDeclared ? '' : '~'}${fmtAmt(derived.netTotal)} ${fp.currency ?? ''}` : '—',
                    netMainLabel:  (() => {
                      if (!derived) return '—'
                      const c = convertToMain(derived.netTotal, fp.currency, mainCurrency)
                      return c != null ? `${isDeclared ? '' : '~'}${fmtAmt(c)} ${mainCurrency}` : '—'
                    })(),
                    type:          fp.type === 'special' ? 'special' : 'regular',
                    sourceLabel:   isDeclared ? (fp.source === 'manual' ? 'Manual' : 'Declared') : 'Est.',
                    sourceClass:   isDeclared ? styles.sourceChipDeclared : styles.sourceChipEstimated,
                    accountName:   '—',
                    action:        !isDeclared ? <button className={styles.projDeclareBtn} onClick={() => setConvertingEstimated(fp)} title="Convert to declared">→ Declare</button> : null,
                  }
                })
                const pastNormalized = payoutsToShow.map(item => {
                  if (item.source === 'user') {
                    const d = item.record
                    const { netTotal } = computeDividendDerived(d)
                    const account = accountsById[d.investingAccountId]
                    const netMain = convertToMain(netTotal, d.currency, mainCurrency)
                    return {
                      key:           d.id,
                      rowClass:      '',
                      exDate:        d.exDividendDate || '—',
                      payDate:       d.payoutDate || null,
                      perShareLabel: `${fmtAmt(d.dividendPerShare)} ${d.currency}`,
                      shares:        d.shareCount,
                      taxPct:        d.taxPercent > 0 ? d.taxPercent : null,
                      netLabel:      `${fmtAmt(netTotal)} ${d.currency}`,
                      netMainLabel:  netMain != null ? `${fmtAmt(netMain)} ${mainCurrency}` : '—',
                      type:          d.type === 'special' ? 'special' : 'regular',
                      sourceLabel:   'User',
                      sourceClass:   styles.sourceChipUser,
                      accountName:   account?.name ?? '—',
                      action:        <button className={styles.divEditBtn} onClick={() => setEditingDividend(d)} title="Edit dividend">✎</button>,
                    }
                  }
                  const r = item.record
                  return {
                    key:           `api-${r.exDate}`,
                    rowClass:      styles.divRowApiUnified,
                    exDate:        r.exDate,
                    payDate:       r.payDate || null,
                    perShareLabel: r.perShare != null ? `${fmtAmt(r.perShare)} ${r.currency ?? ''}` : '—',
                    shares:        null,
                    taxPct:        null,
                    netLabel:      '—',
                    netMainLabel:  '—',
                    type:          r.type === 'special' ? 'special' : 'regular',
                    sourceLabel:   'API',
                    sourceClass:   styles.sourceChipApi,
                    accountName:   '—',
                    action:        null,
                  }
                })
                const renderCell = (col, row) => {
                  switch (col.id) {
                    case 'exDate':   return row.exDate || '—'
                    case 'payDate':  return row.payDate || '—'
                    case 'perShare': return row.perShareLabel
                    case 'shares':   return row.shares != null ? trimDec(row.shares) : '—'
                    case 'taxPct':   return row.taxPct != null ? `${row.taxPct}%` : '—'
                    case 'net':      return row.netLabel
                    case 'netMain':  return row.netMainLabel
                    case 'type':     return row.type === 'special'
                                       ? <span className={styles.divSpecialBadge}>Special</span>
                                       : <span className={styles.divTypeRegular}>Regular</span>
                    case 'source':   return <span className={`${styles.divColSourceChip} ${row.sourceClass}`}>{row.sourceLabel}</span>
                    case 'account':  return row.accountName
                    case 'actions':  return row.action
                    default:         return null
                  }
                }
                const renderRow = (row) => (
                  <div key={row.key} className={`${styles.divTableRow} ${row.rowClass}`}>
                    {visibleCols.map(col => (
                      <span
                        key={col.id}
                        className={`${styles.divCell} ${col.id === 'net' || col.id === 'netMain' ? styles.divCellNet : ''} ${col.id === 'actions' ? styles.divCellActions : ''}`}
                        style={{ minWidth: col.minWidth, flexShrink: 0 }}
                      >
                        {renderCell(col, row)}
                      </span>
                    ))}
                  </div>
                )
                return (
                  <div
                    ref={payoutListRef}
                    className={styles.divTableWrap}
                    style={{ maxHeight: '570px', overflowY: 'auto' }}
                    onScroll={e => {
                      const el = e.currentTarget
                      if (hasMorePayouts && el.scrollHeight - el.scrollTop - el.clientHeight < 40) {
                        setPayoutChunksVisible(n => n + 1)
                      }
                    }}
                  >
                    <div className={styles.divTableHeader}>
                      {visibleCols.map(col => (
                        <span
                          key={col.id}
                          className={styles.divCell}
                          style={{ minWidth: col.minWidth, flexShrink: 0 }}
                          title={col.title}
                        >{col.label}</span>
                      ))}
                    </div>
                    {futureNormalized.map(renderRow)}
                    {mergedPayouts.length > 0 && (
                      <div className={styles.divTodayDivider}>
                        Today — {new Date().toISOString().slice(0, 10)}
                      </div>
                    )}
                    {pastNormalized.map(renderRow)}
                    {hasMorePayouts && <div className={styles.divLoadMore}>↓ scroll for older</div>}
                  </div>
                )
              })()}

              {/* Empty state — position held but no dividend history */}
              {mergedPayouts.length === 0 && futurePayouts.length === 0 && totalShares > 0 && (
                <p className={styles.projNeedMore}>
                  No dividend history yet. Use + Declare to add an expected upcoming payout, or Refresh dividends to fetch from the API.
                </p>
              )}
            </div>
          )}

          {/* Portfolio memberships */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Portfolios</div>
            {myAssignments.length === 0 ? (
              <p className={styles.empty}>Not assigned to any portfolio.</p>
            ) : (
              <div className={styles.portfolioList}>
                {myAssignments.map(a => {
                  const path  = getPortfolioPath(a.portfolioId, allPortfolios)
                  const mvPct = portfolioMvPcts[a.portfolioId]
                  return (
                    <div key={a.id} className={styles.portfolioRow}>
                      <span className={styles.portfolioPath}>{path}</span>
                      <span className={styles.portfolioShare}>
                        {mvPct != null
                          ? `${mvPct.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
                          : '—'}
                      </span>
                      {a.targetPercent !== null && (
                        <span className={styles.portfolioTarget}>{a.targetPercent}% target</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* News */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>News</div>
            {newsStatus === 'loading' && <p className={styles.empty}>Loading news…</p>}
            {newsStatus === 'unavailable' && <p className={styles.empty}>News unavailable.</p>}
            {newsStatus === 'idle' && news.length === 0 && <p className={styles.empty}>No recent news.</p>}
            {news.length > 0 && (
              <div className={styles.newsList}>
                {news.map((item, i) => (
                  <div key={i} className={styles.newsItem}>
                    <a href={item.url} target="_blank" rel="noreferrer" className={styles.newsHeadline}>{item.headline}</a>
                    <div className={styles.newsMeta}>
                      <span className={styles.newsSource}>{item.source}</span>
                      <span className={styles.newsDate}>{formatNewsDate(item.publishedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>{/* /leftCol */}

        {/* Right column: AI chat panel — always rendered */}
        <div className={styles.rightCol}>
          <AiChatPanel
            ticker={norm}
            currency={currency}
            positions={positions}
            dividends={dividends}
            myAssignments={myAssignments}
            allPortfolios={allPortfolios}
            onNavigate={onNavigate}
          />
        </div>

      </div>{/* /body */}
    </div>
  )
}

// ─── Transaction row ──────────────────────────────────────────────────────────

function TxRow({ txn, accountsById, onEditSplit, mainCurrency }) {
  const account = accountsById[txn.investingAccountId]
  const kind = txn._kind

  let badge, badgeCls, desc, amountStr, amountCls

  if (kind === 'buy') {
    badge = 'Buy'; badgeCls = styles.badgeBuy
    desc = `${trimDec(txn.shares)} sh @ ${fmtAmt(txn.price)} ${txn.currency}`
    amountStr = `−${fmtAmt(txn.shares * txn.price + (txn.fee ?? 0))} ${txn.currency}`
    amountCls = styles.txAmountNegative
  } else if (kind === 'sell') {
    badge = 'Sell'; badgeCls = styles.badgeSell
    desc = `${trimDec(txn.shares)} sh @ ${fmtAmt(txn.price)} ${txn.currency}`
    amountStr = `+${fmtAmt(txn.shares * txn.price - (txn.fee ?? 0))} ${txn.currency}`
    amountCls = styles.txAmountPositive
  } else if (kind === 'split') {
    badge = 'Split'; badgeCls = styles.badgeSplit
    const { numerator, denominator } = txn.ratio ?? {}
    const reverse = numerator && denominator && Number(numerator) < Number(denominator)
    desc = `${numerator}-for-${denominator}${reverse ? ' reverse' : ''}`
    amountStr = ''; amountCls = ''
  } else if (kind === 'transfer') {
    badge = 'Transfer'; badgeCls = styles.badgeTransfer
    const dest = accountsById[txn.destinationInvestingAccountId]
    desc = `${trimDec(txn.shares)} sh → ${dest?.name ?? 'unknown account'}`
    amountStr = txn.fee > 0 ? `−${fmtAmt(txn.fee)} fee` : ''
    amountCls = styles.txAmountNegative
  } else if (kind === 'currency-exchange') {
    badge = 'FX'; badgeCls = styles.badgeTransfer
    desc = txn.description ?? `${txn.fromCurrency ?? ''} → ${txn.toCurrency ?? ''}`
    amountStr = txn.fee > 0 ? `−${fmtAmt(txn.fee)} fee` : ''
    amountCls = styles.txAmountNegative
  } else {
    badge = 'Div'; badgeCls = styles.badgeDividend
    const { netTotal } = computeDividendDerived(txn)
    desc = `${fmtAmt(txn.dividendPerShare)}/sh × ${trimDec(txn.shareCount)}`
    amountStr = `+${fmtAmt(netTotal)} ${txn.currency}`
    amountCls = styles.txAmountPositive
  }

  // For buy/sell rows, show the main-currency equivalent when trading ≠ main.
  const mainEquivalent = (() => {
    if (!mainCurrency || txn.currency === mainCurrency) return null
    if (kind !== 'buy' && kind !== 'sell') return null
    const tradingTotal = kind === 'buy'
      ? -(txn.shares * txn.price + (txn.fee ?? 0))
      : txn.shares * txn.price - (txn.fee ?? 0)
    const snap = txn.exchangeRates?.rateToMain
    if (snap) return tradingTotal * snap
    return convertToMain(tradingTotal, txn.currency, mainCurrency) ?? null
  })()

  return (
    <div className={styles.txRow}>
      <span className={styles.txDate}>{txn.date}</span>
      <span className={`${styles.txBadge} ${badgeCls}`}>{badge}</span>
      <span className={styles.txDesc}>{desc}</span>
      <span className={`${styles.txAmount} ${amountCls}`}>{amountStr}</span>
      {mainEquivalent != null && (
        <span className={styles.txMainCcy}>
          ({mainEquivalent >= 0 ? '+' : '−'}{fmtAmt(Math.abs(mainEquivalent))} {mainCurrency}
          {txn.exchangeRates?.rateToMain ? '' : ' ~'})
        </span>
      )}
      {account && <span className={styles.txAccount}>{account.name}</span>}
      {onEditSplit && (
        <button className={styles.txEditBtn} onClick={onEditSplit} title="Edit split">✎</button>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPortfolioPath(portfolioId, portfolios) {
  const parts = []
  let current = portfolios.find(p => p.id === portfolioId)
  while (current) {
    parts.unshift(current.name)
    current = portfolios.find(p => p.id === current.parentId)
  }
  return parts.join(' › ')
}

function trimDec(n) {
  const num = Number(n)
  return num % 1 === 0 ? String(num) : num.toFixed(6).replace(/\.?0+$/, '')
}

function formatNewsDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Date.now() - d
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ─── Yield detail dialog (28b) ────────────────────────────────────────────────
// Shows the exact records and arithmetic behind each of the four yield tiles.
// kind: 'ttm-price' | 'ttm-cost' | 'forward-price' | 'forward-cost'

function YieldDetailDialog({ kind, ttmData, forwardData, price, avgCost, tradingCurrency, onClose }) {
  const isCost     = kind.endsWith('-cost')
  const isForward  = kind.startsWith('forward')
  const denom      = isCost ? avgCost : price
  const denomLabel = isCost ? 'Avg cost per share (fee-incl.)' : 'Current price'
  const ccy        = tradingCurrency || ''

  const fmt4 = n => n == null || !isFinite(n)
    ? '—'
    : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).replace(/,/g, ' ')

  let title, body
  if (isForward) {
    title = isCost ? 'Forward yield on cost' : 'Forward yield (on price)'
    if (!forwardData) {
      body = <p className={styles.dialogNote}>No regular dividend in history — set the dividend frequency on the profile or add at least one regular payout.</p>
    } else {
      const annualised = forwardData.perShare * forwardData.multiplier
      const result     = denom > 0 ? (annualised / denom) * 100 : null
      body = (
        <>
          <p className={styles.dialogFormula}>
            (last regular per-share × frequency multiplier) ÷ {denomLabel} × 100
          </p>
          <table className={styles.yieldTable}>
            <tbody>
              <tr><td>Last regular ex-date</td><td>{forwardData.lastDate}</td></tr>
              <tr><td>Per-share amount</td><td>{fmt4(forwardData.perShare)} {forwardData.currency || ccy}</td></tr>
              <tr><td>Source</td><td>{forwardData.source}</td></tr>
              <tr><td>Frequency</td><td>{forwardData.frequency} (×{forwardData.multiplier} per year)</td></tr>
              <tr><td>Annualised per share</td><td><b>{fmt4(annualised)} {forwardData.currency || ccy}</b></td></tr>
              <tr><td>{denomLabel}</td><td>{fmt4(denom)} {ccy}</td></tr>
              <tr className={styles.yieldTableTotal}>
                <td>Forward yield</td>
                <td>{result != null ? `${result.toFixed(4)} %` : '—'}</td>
              </tr>
            </tbody>
          </table>
          <p className={styles.dialogNote}>
            Special dividends and any payout marked <code>type: 'special'</code> are excluded.
            User records win over API records when both exist for the same ex-date.
          </p>
        </>
      )
    }
  } else {
    title = isCost ? 'TTM yield on cost' : 'TTM yield (on price)'
    if (!ttmData || ttmData.sumPerShare <= 0) {
      body = <p className={styles.dialogNote}>No dividend records in the past 12 months.</p>
    } else {
      const result = denom > 0 ? (ttmData.sumPerShare / denom) * 100 : null
      body = (
        <>
          <p className={styles.dialogFormula}>
            Σ per-share dividends ({ttmData.cutoff} → {ttmData.today}) ÷ {denomLabel} × 100
          </p>
          <div className={styles.yieldTableWrap}>
            <table className={styles.yieldTable}>
              <thead>
                <tr>
                  <th>Ex-date</th>
                  <th>Type</th>
                  <th>Source</th>
                  <th style={{ textAlign: 'right' }}>Per share</th>
                </tr>
              </thead>
              <tbody>
                {ttmData.breakdown.map((r, i) => (
                  <tr key={i}>
                    <td>{r.date}</td>
                    <td>{r.type}{r.type === 'special' && <span className={styles.yieldSpecialBadge}>special</span>}</td>
                    <td>{r.source}</td>
                    <td style={{ textAlign: 'right' }}>{fmt4(r.perShare)} {r.currency || ccy}</td>
                  </tr>
                ))}
                <tr className={styles.yieldTableTotal}>
                  <td colSpan={3}>Total ({ttmData.breakdown.length} record{ttmData.breakdown.length === 1 ? '' : 's'})</td>
                  <td style={{ textAlign: 'right' }}>{fmt4(ttmData.sumPerShare)} {ccy}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <table className={styles.yieldTable} style={{ marginTop: '10px' }}>
            <tbody>
              <tr><td>{denomLabel}</td><td>{fmt4(denom)} {ccy}</td></tr>
              <tr className={styles.yieldTableTotal}>
                <td>TTM yield</td>
                <td>{result != null ? `${result.toFixed(4)} %` : '—'}</td>
              </tr>
            </tbody>
          </table>
          <p className={styles.dialogNote}>
            All dividend types (regular and special) are summed. Forward yield uses regular only.
          </p>
        </>
      )
    }
  }

  return (
    <div className={styles.dialogBackdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`${styles.dialogBox} ${styles.dialogBoxWide}`}>
        <h2 className={styles.dialogTitle}>{title}</h2>
        {body}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogCancelBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit split dialog (26c / item 287) ──────────────────────────────────────

function EditSplitDialog({ txn, onSave, onCancel }) {
  const [date,  setDate]  = useState(txn.date)
  const [num,   setNum]   = useState(String(txn.ratio?.numerator ?? 2))
  const [den,   setDen]   = useState(String(txn.ratio?.denominator ?? 1))
  const [error, setError] = useState('')

  const canSave = Number(num) > 0 && Number(den) > 0 && date

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    setError('')
    try {
      onSave({ date, numerator: Number(num), denominator: Number(den) })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className={styles.dialogBackdrop} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.dialogBox}>
        <h2 className={styles.dialogTitle}>Edit split — {txn.ticker}</h2>
        <p className={styles.dialogNote}>Changing the date or ratio recalculates all affected lot sizes at read time.</p>
        <form onSubmit={handleSubmit}>
          <div className={styles.dialogField}>
            <label className={styles.dialogLabel}>Effective date</label>
            <input className={styles.dialogInput} type="date" value={date} onChange={e => setDate(e.target.value)} autoFocus />
          </div>
          <div className={styles.dialogField}>
            <label className={styles.dialogLabel}>Ratio (new shares for every old share)</label>
            <div className={styles.splitRatioRow}>
              <input className={styles.dialogInputNarrow} type="number" min="0" step="any" value={num} onChange={e => setNum(e.target.value)} />
              <span className={styles.splitSep}>for every</span>
              <input className={styles.dialogInputNarrow} type="number" min="0" step="any" value={den} onChange={e => setDen(e.target.value)} />
              <span className={styles.splitSep}>old</span>
            </div>
            {num && den && Number(den) > 0 && (
              <p className={styles.splitHint}>
                {Number(num) > Number(den)
                  ? `Forward split — shares scale by ${(Number(num) / Number(den)).toFixed(4).replace(/\.?0+$/, '')}×`
                  : Number(num) < Number(den)
                    ? `Reverse split — shares scale by ${(Number(num) / Number(den)).toFixed(4).replace(/\.?0+$/, '')}×`
                    : 'No effect (1:1 ratio)'}
              </p>
            )}
          </div>
          {error && <p className={styles.splitErrorMsg}>{error}</p>}
          <div className={styles.dialogActions}>
            <button type="button" className={styles.dialogCancelBtn} onClick={onCancel}>Cancel</button>
            <button type="submit" className={styles.dialogSaveBtn} disabled={!canSave}>Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit dividend dialog (28f / item 318) ────────────────────────────────────
// Editable fields match what updateDividend() supports.

function EditDividendDialog({ dividend, onSave, onCancel }) {
  const [perShare, setPerShare] = useState(String(dividend.dividendPerShare ?? ''))
  const [taxPct,   setTaxPct]   = useState(String(dividend.taxPercent ?? 0))
  const [type,     setType]     = useState(dividend.type ?? 'regular')

  function handleSubmit(e) {
    e.preventDefault()
    onSave({ dividendPerShare: Number(perShare), taxPercent: Number(taxPct), type })
  }

  return (
    <div className={styles.dialogBackdrop} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.dialogBox}>
        <h2 className={styles.dialogTitle}>Edit dividend — {dividend.ticker}</h2>
        <p className={styles.dialogNote}>{dividend.payoutDate} · {dividend.shareCount} shares</p>
        <form onSubmit={handleSubmit}>
          <div className={styles.dialogField}>
            <label className={styles.dialogLabel}>Per share</label>
            <input
              className={styles.dialogInput}
              type="number" min="0" step="any"
              value={perShare}
              onChange={e => setPerShare(e.target.value)}
              autoFocus
            />
          </div>
          <div className={styles.dialogRow}>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Tax %</label>
              <input
                className={styles.dialogInput}
                type="number" min="0" max="100" step="any"
                value={taxPct}
                onChange={e => setTaxPct(e.target.value)}
              />
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
            <button type="button" className={styles.dialogCancelBtn} onClick={onCancel}>Cancel</button>
            <button type="submit" className={styles.dialogSaveBtn} disabled={!perShare}>Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Convert estimated → declared dialog (28f / item 318 + 28f-ii item 321) ──
// Writes to apiDividendHistory with source:'manual', state:'declared'.
// Used both by per-row → Declare (estimated row) and the standalone + Declare button.

function ConvertToDeclaredDialog({ defaultExDate = '', defaultPerShare = '', defaultCurrency = '', isNew = false, ticker, onSave, onCancel }) {
  const [exDate,   setExDate]   = useState(defaultExDate)
  const [payDate,  setPayDate]  = useState('')
  const [perShare, setPerShare] = useState(String(defaultPerShare ?? ''))
  const [currency, setCurrency] = useState(defaultCurrency)

  const canSave = exDate && perShare && currency

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    onSave({ exDate, payDate: payDate || null, perShare: Number(perShare), currency })
  }

  return (
    <div className={styles.dialogBackdrop} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.dialogBox}>
        <h2 className={styles.dialogTitle}>{isNew ? 'Declare upcoming dividend' : 'Convert to declared'} — {ticker}</h2>
        <p className={styles.dialogNote}>
          Saves a manually declared dividend in the API history.
          Once the dividend pays and you record a payout, this row is hidden automatically.
        </p>
        <form onSubmit={handleSubmit}>
          <div className={styles.dialogRow}>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Ex-dividend date *</label>
              <input
                className={styles.dialogInput}
                type="date"
                value={exDate}
                onChange={e => setExDate(e.target.value)}
                autoFocus
              />
            </div>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Pay date (optional)</label>
              <input
                className={styles.dialogInput}
                type="date"
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.dialogRow}>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Per share *</label>
              <input
                className={styles.dialogInput}
                type="number" min="0" step="any"
                value={perShare}
                onChange={e => setPerShare(e.target.value)}
              />
            </div>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Currency *</label>
              <input
                className={styles.dialogInput}
                value={currency}
                maxLength={4}
                placeholder="USD"
                onChange={e => setCurrency(e.target.value.toUpperCase())}
              />
            </div>
          </div>
          <div className={styles.dialogActions}>
            <button type="button" className={styles.dialogCancelBtn} onClick={onCancel}>Cancel</button>
            <button type="submit" className={styles.dialogSaveBtn} disabled={!canSave}>Save as Declared</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Price chart ──────────────────────────────────────────────────────────────

function PriceChart({ data, status, isIntraday = false }) {
  const [hover, setHover] = useState(null)  // null | { idx, x, y }

  if (status === 'loading') {
    return <div className={styles.chartEmpty}>Loading chart…</div>
  }
  if (status === 'unavailable' || data.length < 2) {
    return <div className={styles.chartEmpty}>{status === 'unavailable' ? 'Chart unavailable' : 'No data'}</div>
  }

  const closes = data.map(d => d.close)
  const minVal = Math.min(...closes)
  const maxVal = Math.max(...closes)
  const range  = maxVal - minVal || 1

  const VW = 800, VH = 220
  const LPAD = 66, RPAD = 8, TPAD = 8, BPAD = 22
  const CW = VW - LPAD - RPAD
  const CH = VH - TPAD - BPAD

  const toX = i => LPAD + (i / (data.length - 1)) * CW
  const toY = v => TPAD + (1 - (v - minVal) / range) * CH

  const pts = data.map((d, i) => `${toX(i).toFixed(1)},${toY(d.close).toFixed(1)}`).join(' ')

  const yTicks = [0, 1/3, 2/3, 1].map(frac => ({
    value: minVal + frac * range,
    y:     toY(minVal + frac * range),
  }))

  const numX = Math.min(5, data.length)
  const xTicks = Array.from({ length: numX }, (_, i) => {
    const idx = Math.round((i / (numX - 1)) * (data.length - 1))
    return { x: toX(idx), date: data[idx].date, i }
  })

  const positive  = closes[closes.length - 1] >= closes[0]
  const lineColor = positive ? '#34d399' : '#f87171'

  function fmtPrice(v) {
    if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
    if (v >= 10)   return v.toFixed(2)
    return v.toFixed(3)
  }

  function fmtDateShort(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  function fmtDateFull(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function fmtTimeShort(iso) {
    // "2024-05-07T14:30:00" → "14:30"
    return iso.slice(11, 16)
  }

  function fmtTimeFull(iso) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  function handleMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * VW
    if (svgX < LPAD || svgX > VW - RPAD) { setHover(null); return }
    const rawIdx = (svgX - LPAD) / CW * (data.length - 1)
    const idx    = Math.max(0, Math.min(data.length - 1, Math.round(rawIdx)))
    setHover({ idx, x: toX(idx), y: toY(data[idx].close) })
  }

  // Build tooltip JSX (positioned in viewBox coordinates)
  let tooltipEl = null
  if (hover) {
    const hd = data[hover.idx]
    const TW = 122, TH = 38
    let tx = hover.x - TW / 2
    let ty = hover.y - TH - 10
    if (tx < LPAD + 2)       tx = LPAD + 2
    if (tx + TW > VW - RPAD) tx = VW - RPAD - TW
    if (ty < TPAD)           ty = hover.y + 12

    tooltipEl = (
      <g pointerEvents="none">
        <line
          x1={hover.x.toFixed(1)} y1={TPAD}
          x2={hover.x.toFixed(1)} y2={TPAD + CH}
          stroke="#334155" strokeWidth="1" strokeDasharray="3,2"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={hover.x.toFixed(1)} cy={hover.y.toFixed(1)}
          r="4" fill={lineColor} stroke="#0f172a" strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        <rect
          x={tx.toFixed(1)} y={ty.toFixed(1)} width={TW} height={TH}
          rx="5" fill="#1e2d40" stroke="#334155" strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={(tx + TW / 2).toFixed(1)} y={(ty + 14).toFixed(1)}
          textAnchor="middle" fontSize="12" fontWeight="600" fill="#f1f5f9"
        >{fmtPrice(hd.close)}</text>
        <text
          x={(tx + TW / 2).toFixed(1)} y={(ty + 28).toFixed(1)}
          textAnchor="middle" fontSize="10" fill="#94a3b8"
        >{isIntraday ? fmtTimeFull(hd.date) : fmtDateFull(hd.date)}</text>
      </g>
    )
  }

  return (
    <div className={styles.chartWrap}>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className={styles.chartSvg}
        style={{ cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Y-axis grid lines + price labels */}
        {yTicks.map(({ value, y }, i) => (
          <g key={i}>
            <line
              x1={LPAD} y1={y.toFixed(1)} x2={VW - RPAD} y2={y.toFixed(1)}
              stroke="#1e293b" strokeWidth="1" vectorEffect="non-scaling-stroke"
            />
            <text
              x={LPAD - 6} y={(y + 4).toFixed(1)}
              textAnchor="end" fontSize="11" fill="#475569"
            >{fmtPrice(value)}</text>
          </g>
        ))}

        {/* X-axis date/time labels */}
        {xTicks.map(({ x, date, i }) => (
          <text
            key={i}
            x={x.toFixed(1)} y={(VH - 5).toFixed(1)}
            textAnchor={i === 0 ? 'start' : i === numX - 1 ? 'end' : 'middle'}
            fontSize="11" fill="#475569"
          >{isIntraday ? fmtTimeShort(date) : fmtDateShort(date)}</text>
        ))}

        {/* Price line */}
        <polyline
          points={pts}
          fill="none" stroke={lineColor} strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />

        {/* Hover: crosshair + dot + tooltip */}
        {tooltipEl}

      </svg>
    </div>
  )
}
