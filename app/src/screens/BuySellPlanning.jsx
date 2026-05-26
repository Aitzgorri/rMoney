import { useState, useEffect, useMemo } from 'react'
import {
  getTradingScenarios, getTradingScenario, createTradingScenario, renameTradingScenario,
  duplicateTradingScenario, deleteTradingScenario,
  getActiveScenarioId, setActiveScenarioId,
  addSellRow, addBuyRow, updateSellRow, updateBuyRow, removeSellRow, removeBuyRow,
  getLastBuyAccountId,
  setCashTopUp, setFxOverride, setDisplayedCurrencies, setRemoveExecutedRows,
  markRowExecuted,
} from '../data/tradingScenarios'
import { getInvestingAccounts, getCashBalances, getCurrentBalance, getCashBalanceByCurrency } from '../data/investingAccounts'
import { getActiveStockProfiles, getStockProfile } from '../data/stockProfiles'
import { getOpenLots, createBuy, createSell, computeFifoAllocations } from '../data/stockTransactions'
import { getApiDividendHistoryForTicker } from '../data/apiDividendHistory'
import { getDividendsByTicker, resolveDividendTaxPercent } from '../data/dividends'
import { getMainCurrency, resolveTradingFee } from '../data/settings'
import { getLatestPrice } from '../data/marketDataClient'
import { getCachedRates, ensureRates, snapshotFxRates } from '../utils/currency'
import { detectEffectiveDividendFrequency } from '../utils/dividendProjections'
import {
  computeSellRowDerived, computeBuyRowDerived,
  simulateCashImpact, lookupFxRate, longTermSharesCount,
  computeDividendAggregates,
} from '../utils/planningCalc'
import ConfigurableTable from '../components/ConfigurableTable'
import { resetPageCaches } from '../utils/marketDataCache'
import styles from './BuySellPlanning.module.css'

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)
const TWELVE_MONTHS_AGO = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

export default function BuySellPlanning({ onNavigate }) {
  const [scenarios, setScenarios] = useState(() => getTradingScenarios())
  const [activeId, setActiveIdState] = useState(() => {
    const stored = getActiveScenarioId()
    const list = getTradingScenarios()
    return stored && list.some(s => s.id === stored) ? stored : (list[0]?.id ?? null)
  })

  const [accounts, setAccounts] = useState(() => getInvestingAccounts())
  const [profiles, setProfiles] = useState(() => getActiveStockProfiles())
  const mainCurrency = useMemo(() => getMainCurrency(), [])

  // Live price + FX caches (ticker → { price, currency }, ccy → number)
  const [livePrices, setLivePrices] = useState({})
  const [liveFx, setLiveFx]         = useState(() => getCachedRates() ?? null)

  const [resetState, setResetState] = useState('idle')

  function handleResetApi() {
    setResetState('running')
    resetPageCaches('buy-sell-planning')
    setTimeout(() => { setResetState('done') }, 300)
    setTimeout(() => { setResetState('idle') }, 2300)
  }

  // Modals
  const [newScenarioOpen, setNewScenarioOpen] = useState(false)
  const [newScenarioName, setNewScenarioName] = useState('')
  const [renameOpen,      setRenameOpen]      = useState(false)
  const [renameValue,     setRenameValue]     = useState('')
  const [deleteOpen,      setDeleteOpen]      = useState(false)
  const [buyPickerOpen,   setBuyPickerOpen]   = useState(false)
  const [sellPickerOpen,  setSellPickerOpen]  = useState(false)
  const [executeTarget,   setExecuteTarget]   = useState(null) // { side, row, derived } | null

  useEffect(() => { setActiveScenarioId(activeId) }, [activeId])

  // Refresh rates on mount; non-blocking.
  useEffect(() => {
    ensureRates(mainCurrency).then(cache => setLiveFx(cache)).catch(() => {})
  }, [mainCurrency])

  function refresh() { setScenarios(getTradingScenarios()) }

  const active = useMemo(
    () => scenarios.find(s => s.id === activeId) ?? null,
    [scenarios, activeId]
  )

  // ── Tickers we need data for (rows + dropdown candidates) ──────────────────
  const tickersInScenario = useMemo(() => {
    if (!active) return []
    return [...new Set([
      ...active.sellRows.map(r => r.ticker),
      ...active.buyRows.map(r => r.ticker),
    ])]
  }, [active])

  // Fire price lookups lazily once per ticker. getLatestPrice consults the
  // manual-price override + the in-memory cache before hitting the network.
  useEffect(() => {
    for (const t of tickersInScenario) {
      if (livePrices[t] !== undefined) continue
      setLivePrices(prev => ({ ...prev, [t]: 'loading' }))
      const profile = getStockProfile(t)
      getLatestPrice(t, profile?.stockExchange ?? null)
        .then(r => setLivePrices(prev => ({ ...prev, [t]: { price: r.price, currency: r.currency } })))
        .catch(() => setLivePrices(prev => ({ ...prev, [t]: null })))
    }
  }, [tickersInScenario]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Open-lots map: { [accountId]: { [ticker]: { totalShares, ltShares } } } ─
  const openLotsMap = useMemo(() => {
    const map = {}
    const known = new Set([
      ...tickersInScenario,
      ...profiles.map(p => p.ticker),
    ])
    for (const acc of accounts) {
      for (const t of known) {
        const lots = getOpenLots(acc.id, t)
        const totalShares = lots.reduce((s, l) => s + l.remainingShares, 0)
        if (totalShares > 0) {
          map[acc.id] = map[acc.id] ?? {}
          map[acc.id][t] = { totalShares, ltShares: longTermSharesCount(lots) }
        }
      }
    }
    return map
  }, [accounts, profiles, tickersInScenario])

  function accountsHolding(ticker) {
    return accounts.filter(a => (openLotsMap[a.id]?.[ticker]?.totalShares ?? 0) > 0)
  }
  function availableShares(accountId, ticker) {
    return openLotsMap[accountId]?.[ticker]?.totalShares ?? 0
  }
  function longTermShares(accountId, ticker) {
    return openLotsMap[accountId]?.[ticker]?.ltShares ?? 0
  }

  // ── Yield + tax data per ticker (synchronous read from localStorage) ───────
  const tickerYieldData = useMemo(() => {
    const out = {}
    const today = TODAY_ISO()
    const cutoff = TWELVE_MONTHS_AGO()
    for (const t of tickersInScenario) {
      const apiHistory = getApiDividendHistoryForTicker(t)
      const userDivs   = getDividendsByTicker(t)
      const profile    = getStockProfile(t)

      // TTM per-share: sum of regular + special payouts in trailing 12 months
      const apiIn12m = apiHistory.filter(r => r.exDate >= cutoff && r.exDate <= today)
      const apiExDates = new Set(apiIn12m.map(r => r.exDate))
      const userGap = userDivs.filter(d =>
        d.exDividendDate && d.exDividendDate >= cutoff && d.exDividendDate <= today
        && !apiExDates.has(d.exDividendDate)
      )
      const ttmPerShare =
        apiIn12m.reduce((s, r) => s + (r.perShare ?? 0), 0) +
        userGap.reduce((s, d) => s + (d.dividendPerShare ?? 0), 0)

      // Forward per-share: last regular payout (API + user merged, user wins)
      const merged = new Map()
      for (const r of apiHistory) {
        if (r.exDate <= today && (r.type == null || r.type === 'regular')) {
          merged.set(r.exDate, { perShare: r.perShare })
        }
      }
      for (const d of userDivs) {
        if (d.exDividendDate && d.exDividendDate <= today && (d.type == null || d.type === 'regular')) {
          merged.set(d.exDividendDate, { perShare: d.dividendPerShare })
        }
      }
      const sortedKeys = [...merged.keys()].sort().reverse()
      const lastRegular = sortedKeys[0] ? merged.get(sortedKeys[0])?.perShare : null

      const frequency = detectEffectiveDividendFrequency(
        profile?.dividendFrequency ?? 'unknown',
        { apiHistory, userDividends: userDivs },
      )

      out[t] = {
        ttmPerShare,
        forwardPerShare: lastRegular ?? 0,
        frequency,
        taxPct: resolveDividendTaxPercent(t),
        profileName: profile?.name ?? null,
        profileExchange: profile?.stockExchange ?? null,
        profileCurrency: profile?.currency ?? null,
      }
    }
    return out
  }, [tickersInScenario])

  // ── FX rates effective map (user override beats live spot) ─────────────────
  const fxRatesEffective = useMemo(() => {
    const out = {}
    // Seed from live cache (rates are "1 main = N foreign" → we store both directions)
    if (liveFx?.rates) {
      for (const [ccy, perOneMain] of Object.entries(liveFx.rates)) {
        if (perOneMain && Number.isFinite(perOneMain)) {
          out[`${mainCurrency}->${ccy}`] = perOneMain
          out[`${ccy}->${mainCurrency}`] = 1 / perOneMain
        }
      }
    }
    // Apply per-scenario overrides last so they win
    for (const [pair, rate] of Object.entries(active?.fxOverrides ?? {})) {
      const n = Number(rate)
      if (Number.isFinite(n) && n > 0) out[pair] = n
    }
    return out
  }, [liveFx, mainCurrency, active?.fxOverrides])

  // ── Cash balances rolled up across all investing accounts, by currency ─────
  const balancesByCurrency = useMemo(() => {
    const out = {}
    for (const acc of accounts) {
      for (const bal of getCashBalances(acc.id)) {
        const v = getCurrentBalance(bal.id)
        out[bal.currency] = (out[bal.currency] ?? 0) + v
      }
    }
    return out
  }, [accounts])

  // ── Derived numbers per row ────────────────────────────────────────────────
  const derivedSell = useMemo(() => {
    if (!active) return {}
    const out = {}
    for (const row of active.sellRows) {
      out[row.id] = computeSellRowDerived(row, buildRowCtx(row))
    }
    return out
  }, [active, livePrices, fxRatesEffective, tickerYieldData, mainCurrency]) // eslint-disable-line react-hooks/exhaustive-deps

  const derivedBuy = useMemo(() => {
    if (!active) return {}
    const out = {}
    for (const row of active.buyRows) {
      out[row.id] = computeBuyRowDerived(row, buildRowCtx(row))
    }
    return out
  }, [active, livePrices, fxRatesEffective, tickerYieldData, mainCurrency]) // eslint-disable-line react-hooks/exhaustive-deps

  function buildRowCtx(row) {
    const yd = tickerYieldData[row.ticker] ?? {}
    const livePrice = livePrices[row.ticker]
    const isLoading = livePrice === 'loading'
    return {
      ticker: row.ticker,
      exchange: row.stockExchange,
      tradingCurrency: row.currency,
      mainCurrency,
      lastPrice: (livePrice && livePrice !== 'loading' && livePrice !== null) ? livePrice.price : null,
      priceLoading: isLoading,
      ttmPerShare: yd.ttmPerShare ?? 0,
      forwardPerShare: yd.forwardPerShare ?? 0,
      frequency: yd.frequency,
      taxPct: yd.taxPct ?? 0,
      fxRates: fxRatesEffective,
      resolveFee: resolveTradingFee,
    }
  }

  // ── Cash impact simulation ─────────────────────────────────────────────────
  const cashImpact = useMemo(() => {
    if (!active) return { perCurrency: {}, shortfall: {} }
    return simulateCashImpact({
      scenario: active,
      balancesByCurrency,
      fxRates: fxRatesEffective,
      mainCurrency,
      derivedSellRows: derivedSell,
      derivedBuyRows: derivedBuy,
    })
  }, [active, balancesByCurrency, fxRatesEffective, mainCurrency, derivedSell, derivedBuy])

  // ── Displayed-currency picker (default: all trade currencies + main) ───────
  const distinctTradeCurrencies = useMemo(() => {
    if (!active) return []
    const set = new Set()
    for (const r of [...active.sellRows, ...active.buyRows]) {
      if (r.included && !r.executedAt && r.currency) set.add(r.currency)
    }
    return [...set]
  }, [active])

  const displayedCurrencies = useMemo(() => {
    if (!active) return [mainCurrency]
    if (active.displayedCurrencies?.length) return active.displayedCurrencies
    return [...new Set([...distinctTradeCurrencies, mainCurrency])]
  }, [active, distinctTradeCurrencies, mainCurrency])

  // ── Aggregate dividend metrics ─────────────────────────────────────────────
  const sellAggregates = useMemo(
    () => active ? computeDividendAggregates({
      rows: active.sellRows, derived: derivedSell, mainCurrency, fxRates: fxRatesEffective, side: 'sell',
    }) : null,
    [active, derivedSell, fxRatesEffective, mainCurrency]
  )
  const buyAggregates  = useMemo(
    () => active ? computeDividendAggregates({
      rows: active.buyRows, derived: derivedBuy, mainCurrency, fxRates: fxRatesEffective, side: 'buy',
    }) : null,
    [active, derivedBuy, fxRatesEffective, mainCurrency]
  )

  // ── Scenario CRUD handlers ─────────────────────────────────────────────────

  function handleCreateScenario() {
    const name = newScenarioName.trim()
    if (!name) return
    const s = createTradingScenario(name)
    setNewScenarioName('')
    setNewScenarioOpen(false)
    refresh()
    setActiveIdState(s.id)
  }

  function handleRename() {
    const name = renameValue.trim()
    if (!name || !active) return
    renameTradingScenario(active.id, name)
    setRenameOpen(false)
    refresh()
  }

  function handleDuplicate() {
    if (!active) return
    const copy = duplicateTradingScenario(active.id)
    refresh()
    if (copy) setActiveIdState(copy.id)
  }

  function handleDelete() {
    if (!active) return
    deleteTradingScenario(active.id)
    setDeleteOpen(false)
    const remaining = getTradingScenarios()
    setScenarios(remaining)
    setActiveIdState(remaining[0]?.id ?? null)
  }

  // ── Row handlers ───────────────────────────────────────────────────────────

  function handleAddSell(row) {
    if (!active) return
    addSellRow(active.id, row)
    setSellPickerOpen(false)
    refresh()
  }

  function handleAddBuy(row) {
    if (!active) return
    addBuyRow(active.id, row)
    setBuyPickerOpen(false)
    refresh()
  }

  function updateSellField(rowId, fields) {
    updateSellRow(active.id, rowId, fields)
    refresh()
  }
  function updateBuyField(rowId, fields) {
    updateBuyRow(active.id, rowId, fields)
    refresh()
  }

  function handleUpdateSellShares(rowId, raw, max) {
    const n = Number(raw)
    if (Number.isNaN(n) || n < 0) return
    const clamped = max > 0 ? Math.min(n, max) : n
    updateSellField(rowId, { shares: clamped })
  }

  function handleSellAccountChange(rowId, ticker, accountId) {
    const max = availableShares(accountId, ticker)
    const row = active.sellRows.find(r => r.id === rowId)
    const shares = row && row.shares > max ? max : row?.shares
    updateSellField(rowId, { investingAccountId: accountId, shares })
  }

  function handleRemoveSell(rowId) {
    removeSellRow(active.id, rowId)
    refresh()
  }
  function handleRemoveBuy(rowId) {
    removeBuyRow(active.id, rowId)
    refresh()
  }

  function handleExecute(side, row) {
    const d = side === 'sell' ? derivedSell[row.id] : derivedBuy[row.id]
    setExecuteTarget({ side, row, derived: d })
  }

  function handleToggleRemoveExecuted() {
    if (!active) return
    setRemoveExecutedRows(active.id, !active.removeExecutedRows)
    refresh()
  }

  function handleSetTopUp(currency, value) {
    if (!active) return
    setCashTopUp(active.id, currency, value)
    refresh()
  }

  function handleSetFxOverride(pair, value) {
    if (!active) return
    setFxOverride(active.id, pair, value)
    refresh()
  }

  function handleToggleDisplayedCurrency(ccy) {
    if (!active) return
    const next = displayedCurrencies.includes(ccy)
      ? displayedCurrencies.filter(c => c !== ccy)
      : [...displayedCurrencies, ccy]
    setDisplayedCurrencies(active.id, next)
    refresh()
  }

  // ── Column factories ───────────────────────────────────────────────────────

  const sellColumns = useMemo(() => buildSellColumns({
    active,
    accountsHolding,
    availableShares,
    longTermShares,
    livePrices,
    derived: derivedSell,
    fxRatesEffective,
    mainCurrency,
    tickerYieldData,
    onUpdateRow: updateSellField,
    onRemoveRow: handleRemoveSell,
    onAccountChange: handleSellAccountChange,
    onSharesChange:  handleUpdateSellShares,
    onTickerClick:   t => onNavigate?.('stock', { ticker: t }),
    onExecute:       row => handleExecute('sell', row),
  }), [active, openLotsMap, livePrices, derivedSell, fxRatesEffective, tickerYieldData]) // eslint-disable-line react-hooks/exhaustive-deps

  const buyColumns = useMemo(() => buildBuyColumns({
    active,
    accounts,
    livePrices,
    derived: derivedBuy,
    fxRatesEffective,
    mainCurrency,
    tickerYieldData,
    onUpdateRow: updateBuyField,
    onRemoveRow: handleRemoveBuy,
    onTickerClick: t => onNavigate?.('stock', { ticker: t }),
    onExecute:    row => handleExecute('buy', row),
  }), [active, accounts, livePrices, derivedBuy, fxRatesEffective, tickerYieldData]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Buy-Sell Planning</h1>
        <div className={styles.scenarioBar}>
          {scenarios.length > 0 && (
            <>
              <label className={styles.scenarioLabel}>Scenario</label>
              <select
                className={styles.scenarioSelect}
                value={activeId ?? ''}
                onChange={e => setActiveIdState(e.target.value)}
              >
                {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </>
          )}
          <button
            className={styles.scenarioBtn}
            onClick={() => { setNewScenarioName(''); setNewScenarioOpen(true) }}
          >+ New</button>
          {active && (
            <>
              <button
                className={styles.scenarioBtn}
                onClick={() => { setRenameValue(active.name); setRenameOpen(true) }}
              >Rename</button>
              <button className={styles.scenarioBtn} onClick={handleDuplicate}>Duplicate</button>
              <button
                className={`${styles.scenarioBtn} ${styles.scenarioBtnDanger}`}
                onClick={() => setDeleteOpen(true)}
              >Delete</button>
              <label className={styles.scenarioToggle} title="If on, executed rows disappear from the scenario after they're committed to a real transaction.">
                <input
                  type="checkbox"
                  checked={!!active.removeExecutedRows}
                  onChange={handleToggleRemoveExecuted}
                />
                Remove executed rows
              </label>
            </>
          )}
          <button
            className={styles.scenarioBtn}
            onClick={handleResetApi}
            disabled={resetState !== 'idle'}
            title="Clear cached prices and forex rates so the next load fetches fresh data"
          >
            {resetState === 'running' ? 'Resetting…' : resetState === 'done' ? 'Refreshed ✓' : 'Reset API'}
          </button>
        </div>
      </header>

      {!active && (
        <div className={styles.empty}>
          <p className={styles.emptyMain}>No scenarios yet — Create one to start planning.</p>
          <p className={styles.emptyHint}>
            Scenarios let you draft buys and sells before committing them. Nothing here changes real
            data until you explicitly execute a row.
          </p>
        </div>
      )}

      {active && (
        <>
          <OverviewBlock
            scenario={active}
            mainCurrency={mainCurrency}
            balancesByCurrency={balancesByCurrency}
            distinctTradeCurrencies={distinctTradeCurrencies}
            displayedCurrencies={displayedCurrencies}
            onToggleDisplayed={handleToggleDisplayedCurrency}
            fxRatesEffective={fxRatesEffective}
            onSetTopUp={handleSetTopUp}
            onSetFxOverride={handleSetFxOverride}
            cashImpact={cashImpact}
            sellAggregates={sellAggregates}
            buyAggregates={buyAggregates}
          />

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Sells</h2>
              <button
                className={styles.addBtn}
                onClick={() => setSellPickerOpen(true)}
                disabled={Object.keys(openLotsMap).length === 0}
                title={Object.keys(openLotsMap).length === 0 ? 'No open positions to sell' : ''}
              >+ Add sell</button>
            </div>
            <ConfigurableTable
              columns={sellColumns}
              rows={active.sellRows}
              rowKey={r => r.id}
              storageKey={`rmoney_bsp_sell_columns_${active.id}`}
              emptyMessage="No sells planned yet."
              maxHeight="480px"
            />
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Buys</h2>
              <button
                className={styles.addBtn}
                onClick={() => setBuyPickerOpen(true)}
                disabled={accounts.length === 0}
                title={accounts.length === 0 ? 'Create an investing account first' : ''}
              >+ Add buy</button>
            </div>
            <ConfigurableTable
              columns={buyColumns}
              rows={active.buyRows}
              rowKey={r => r.id}
              storageKey={`rmoney_bsp_buy_columns_${active.id}`}
              emptyMessage="No buys planned yet."
              maxHeight="480px"
            />
          </section>
        </>
      )}

      {newScenarioOpen && (
        <ModalShell onClose={() => setNewScenarioOpen(false)} title="New scenario">
          <input
            autoFocus
            className={styles.modalInput}
            value={newScenarioName}
            onChange={e => setNewScenarioName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateScenario() }}
            placeholder="e.g. April rebalance"
          />
          <div className={styles.modalActions}>
            <button className={styles.modalCancel} onClick={() => setNewScenarioOpen(false)}>Cancel</button>
            <button
              className={styles.modalPrimary}
              onClick={handleCreateScenario}
              disabled={!newScenarioName.trim()}
            >Create</button>
          </div>
        </ModalShell>
      )}

      {renameOpen && active && (
        <ModalShell onClose={() => setRenameOpen(false)} title="Rename scenario">
          <input
            autoFocus
            className={styles.modalInput}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRename() }}
          />
          <div className={styles.modalActions}>
            <button className={styles.modalCancel} onClick={() => setRenameOpen(false)}>Cancel</button>
            <button
              className={styles.modalPrimary}
              onClick={handleRename}
              disabled={!renameValue.trim()}
            >Rename</button>
          </div>
        </ModalShell>
      )}

      {deleteOpen && active && (
        <ModalShell onClose={() => setDeleteOpen(false)} title="Delete scenario">
          <p className={styles.modalText}>
            Delete <strong>{active.name}</strong>? This cannot be undone.
          </p>
          <div className={styles.modalActions}>
            <button className={styles.modalCancel} onClick={() => setDeleteOpen(false)}>Cancel</button>
            <button className={styles.modalDanger} onClick={handleDelete}>Delete</button>
          </div>
        </ModalShell>
      )}

      {sellPickerOpen && active && (
        <PositionPicker
          accounts={accounts}
          openLotsMap={openLotsMap}
          existingRows={active.sellRows}
          onCancel={() => setSellPickerOpen(false)}
          onPick={handleAddSell}
        />
      )}

      {buyPickerOpen && active && (
        <StockPicker
          profiles={profiles}
          accounts={accounts}
          defaultAccountId={
            getLastBuyAccountId() && accounts.some(a => a.id === getLastBuyAccountId())
              ? getLastBuyAccountId()
              : accounts[0]?.id
          }
          onCancel={() => setBuyPickerOpen(false)}
          onPick={handleAddBuy}
        />
      )}

      {executeTarget && active && (
        <ExecuteModal
          side={executeTarget.side}
          row={executeTarget.row}
          derived={executeTarget.derived}
          accounts={accounts}
          activeId={active.id}
          mainCurrency={mainCurrency}
          onClose={() => setExecuteTarget(null)}
          onDone={() => { setExecuteTarget(null); refresh() }}
        />
      )}
    </div>
  )
}

// ─── Overview block ───────────────────────────────────────────────────────────

function OverviewBlock({
  scenario, mainCurrency, balancesByCurrency,
  distinctTradeCurrencies, displayedCurrencies, onToggleDisplayed,
  fxRatesEffective, onSetTopUp, onSetFxOverride,
  cashImpact, sellAggregates, buyAggregates,
}) {
  // FX rates panel — pair every distinct trade currency with main
  const fxPairs = useMemo(() => {
    const out = []
    for (const ccy of distinctTradeCurrencies) {
      if (ccy === mainCurrency) continue
      out.push(`${ccy}->${mainCurrency}`)
    }
    return out
  }, [distinctTradeCurrencies, mainCurrency])

  const allCurrenciesForPicker = useMemo(() => {
    return [...new Set([...distinctTradeCurrencies, mainCurrency])]
  }, [distinctTradeCurrencies, mainCurrency])

  // Dividend delta (buys − sells), in main currency
  const dividendDelta = useMemo(() => {
    if (!sellAggregates || !buyAggregates) return null
    return {
      pctDelta: (buyAggregates.avgFwdPct ?? 0) - (sellAggregates.avgFwdPct ?? 0),
      grossDelta: (buyAggregates.monthGross ?? 0) - (sellAggregates.monthGross ?? 0),
      netDelta:   (buyAggregates.monthNet   ?? 0) - (sellAggregates.monthNet   ?? 0),
    }
  }, [sellAggregates, buyAggregates])

  return (
    <section className={styles.overview}>
      <div className={styles.overviewGrid}>
        <div className={styles.overviewCard}>
          <h3 className={styles.overviewCardTitle}>Cash balances + planning top-up</h3>
          <table className={styles.balancesTable}>
            <thead>
              <tr>
                <th>Currency</th>
                <th className={styles.tdRight}>Current</th>
                <th className={styles.tdRight}>+ Top up</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(balancesByCurrency).length === 0 && (
                <tr><td colSpan="3" className={styles.cellMuted}>No cash balances yet.</td></tr>
              )}
              {Object.keys(balancesByCurrency).sort().map(ccy => (
                <tr key={ccy}>
                  <td>{ccy}</td>
                  <td className={styles.tdRight}>{fmtNum(balancesByCurrency[ccy])}</td>
                  <td className={styles.tdRight}>
                    <input
                      className={styles.cellInputSm}
                      type="number"
                      step="any"
                      value={scenario.cashTopUps?.[ccy] ?? ''}
                      onChange={e => onSetTopUp(ccy, e.target.value)}
                      placeholder="0"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.overviewCard}>
          <h3 className={styles.overviewCardTitle}>FX rates (trade ccy → {mainCurrency})</h3>
          {fxPairs.length === 0 ? (
            <p className={styles.cellMuted}>All planned trades are already in {mainCurrency}.</p>
          ) : (
            <table className={styles.balancesTable}>
              <thead>
                <tr><th>Pair</th><th className={styles.tdRight}>Live</th><th className={styles.tdRight}>Override</th></tr>
              </thead>
              <tbody>
                {fxPairs.map(pair => {
                  const [from, to] = pair.split('->')
                  const live = fxRatesEffective[pair] // already merged but we want pure-live for the label
                  const override = scenario.fxOverrides?.[pair] ?? ''
                  return (
                    <tr key={pair}>
                      <td>{from} → {to}</td>
                      <td className={styles.tdRight}>{fmtRate(live)}</td>
                      <td className={styles.tdRight}>
                        <input
                          className={styles.cellInputSm}
                          type="number"
                          step="any"
                          value={override}
                          onChange={e => onSetFxOverride(pair, e.target.value)}
                          placeholder="—"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className={styles.overviewCard}>
          <h3 className={styles.overviewCardTitle}>Display in</h3>
          <div className={styles.currencyPicker}>
            {allCurrenciesForPicker.map(ccy => (
              <label key={ccy} className={styles.currencyPickerItem}>
                <input
                  type="checkbox"
                  checked={displayedCurrencies.includes(ccy)}
                  onChange={() => onToggleDisplayed(ccy)}
                />
                {ccy}
              </label>
            ))}
          </div>
          <p className={styles.cellMuted}>
            Controls which currencies appear in the cash-impact totals below.
          </p>
        </div>
      </div>

      <div className={styles.overviewCardWide}>
        <h3 className={styles.overviewCardTitle}>Cash impact</h3>
        <table className={styles.impactTable}>
          <thead>
            <tr>
              <th>Currency</th>
              <th className={styles.tdRight}>Start</th>
              <th className={styles.tdRight}>Top up</th>
              <th className={styles.tdRight}>Sells</th>
              <th className={styles.tdRight}>Buys</th>
              <th className={styles.tdRight}>Transfer in</th>
              <th className={styles.tdRight}>Transfer out</th>
              <th className={styles.tdRight}>End</th>
            </tr>
          </thead>
          <tbody>
            {displayedCurrencies.map(ccy => {
              const row = cashImpact.perCurrency[ccy] ?? { start: 0, topUp: 0, sells: 0, buys: 0, transferIn: 0, transferOut: 0, end: 0 }
              const negative = row.end < 0
              return (
                <tr key={ccy}>
                  <td>{ccy}</td>
                  <td className={styles.tdRight}>{fmtNum(row.start)}</td>
                  <td className={styles.tdRight}>{row.topUp ? fmtSigned(row.topUp) : '—'}</td>
                  <td className={styles.tdRight}>{row.sells ? fmtSigned(row.sells) : '—'}</td>
                  <td className={styles.tdRight}>{row.buys ? fmtSigned(-row.buys) : '—'}</td>
                  <td className={styles.tdRight}>{row.transferIn ? fmtSigned(row.transferIn) : '—'}</td>
                  <td className={styles.tdRight}>{row.transferOut ? fmtSigned(-row.transferOut) : '—'}</td>
                  <td className={`${styles.tdRight} ${negative ? styles.negative : styles.positive}`}>
                    <strong>{fmtNum(row.end)}</strong>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {Object.keys(cashImpact.shortfall).length > 0 && (
          <p className={styles.shortfall}>
            Shortfall: {Object.entries(cashImpact.shortfall).map(([c, v]) => `${c} ${fmtNum(v)}`).join(' · ')}
          </p>
        )}
      </div>

      <div className={styles.overviewCardWide}>
        <h3 className={styles.overviewCardTitle}>
          Dividend impact (forward yield, weighted by trade value in {mainCurrency})
        </h3>
        <table className={styles.impactTable}>
          <thead>
            <tr>
              <th></th>
              <th className={styles.tdRight}>Avg forward yield</th>
              <th className={styles.tdRight}>Avg TTM yield</th>
              <th className={styles.tdRight}>Per-month gross ({mainCurrency})</th>
              <th className={styles.tdRight}>Per-month net ({mainCurrency})</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Sells (drag on income)</td>
              <td className={styles.tdRight}>{fmtPct(sellAggregates?.avgFwdPct)}</td>
              <td className={styles.tdRight}>{fmtPct(sellAggregates?.avgTtmPct)}</td>
              <td className={styles.tdRight}>{fmtSigned(-(sellAggregates?.monthGross ?? 0))}</td>
              <td className={styles.tdRight}>{fmtSigned(-(sellAggregates?.monthNet ?? 0))}</td>
            </tr>
            <tr>
              <td>Buys (added income)</td>
              <td className={styles.tdRight}>{fmtPct(buyAggregates?.avgFwdPct)}</td>
              <td className={styles.tdRight}>{fmtPct(buyAggregates?.avgTtmPct)}</td>
              <td className={styles.tdRight}>{fmtSigned(buyAggregates?.monthGross ?? 0)}</td>
              <td className={styles.tdRight}>{fmtSigned(buyAggregates?.monthNet ?? 0)}</td>
            </tr>
            {dividendDelta && (
              <tr className={styles.deltaRow}>
                <td>Δ Difference (buys − sells)</td>
                <td className={styles.tdRight}>{fmtPct(dividendDelta.pctDelta, true)}</td>
                <td></td>
                <td className={`${styles.tdRight} ${dividendDelta.grossDelta < 0 ? styles.negative : styles.positive}`}>
                  {fmtSigned(dividendDelta.grossDelta)}
                </td>
                <td className={`${styles.tdRight} ${dividendDelta.netDelta < 0 ? styles.negative : styles.positive}`}>
                  {fmtSigned(dividendDelta.netDelta)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── ConfigurableTable column factories ─────────────────────────────────────

function buildSellColumns({
  active, accountsHolding, availableShares, longTermShares,
  livePrices, derived, fxRatesEffective, mainCurrency, tickerYieldData,
  onUpdateRow, onRemoveRow, onAccountChange, onSharesChange, onTickerClick, onExecute,
}) {
  return [
    { id: 'include', label: '', minWidth: 28,
      render: r => (
        <input
          type="checkbox"
          checked={!!r.included}
          disabled={!!r.executedAt}
          onChange={e => onUpdateRow(r.id, { included: e.target.checked })}
        />
      ) },
    { id: 'ticker', label: 'Ticker', minWidth: 78, sortValue: r => r.ticker,
      render: r => (
        <button className={styles.tickerLink} onClick={() => onTickerClick(r.ticker)}>{r.ticker}</button>
      ) },
    { id: 'account', label: 'Account', minWidth: 180,
      render: r => {
        const holders = accountsHolding(r.ticker)
        return (
          <select
            className={styles.cellSelect}
            value={r.investingAccountId}
            onChange={e => onAccountChange(r.id, r.ticker, e.target.value)}
          >
            {holders.map(a => (
              <option key={a.id} value={a.id}>{a.institution} — {a.name}</option>
            ))}
          </select>
        )
      } },
    { id: 'shares', label: 'Shares to sell', minWidth: 110,
      render: r => {
        const max = availableShares(r.investingAccountId, r.ticker)
        return (
          <input
            type="number"
            className={styles.cellInput}
            value={r.shares}
            min="0"
            max={max}
            step="any"
            onChange={e => onSharesChange(r.id, e.target.value, max)}
          />
        )
      } },
    { id: 'available', label: 'Available', minWidth: 110,
      render: r => {
        const max = availableShares(r.investingAccountId, r.ticker)
        const lt = longTermShares(r.investingAccountId, r.ticker)
        return (
          <div>
            <div>{fmtShares(max)}</div>
            <div className={styles.subLine} title="Long-term-hold count is informational; tax treatment depends on your jurisdiction.">
              ({fmtShares(lt)} LT)
            </div>
          </div>
        )
      } },
    { id: 'name', label: 'Name', minWidth: 150, defaultHidden: true,
      render: r => tickerYieldData[r.ticker]?.profileName ?? '—' },
    { id: 'exchange', label: 'Exchange', minWidth: 90, defaultHidden: true,
      render: r => r.stockExchange ?? tickerYieldData[r.ticker]?.profileExchange ?? '—' },
    { id: 'currency', label: 'Ccy', minWidth: 60,
      render: r => r.currency ?? '—' },
    { id: 'fxToMain', label: `FX → ${mainCurrency}`, minWidth: 90, defaultHidden: true,
      render: r => {
        if (!r.currency || r.currency === mainCurrency) return '—'
        return fmtRate(lookupFxRate(r.currency, mainCurrency, fxRatesEffective))
      } },
    { id: 'lastPrice', label: 'Last price', minWidth: 90, align: 'right',
      render: r => {
        const lp = livePrices[r.ticker]
        if (lp === 'loading') return <span className={styles.cellMuted}>…</span>
        if (!lp) return '—'
        return fmtNum(lp.price)
      } },
    { id: 'adjustedPrice', label: 'Adjusted price', minWidth: 180,
      render: r => (
        <AdjustedPriceCell
          row={r}
          lastPrice={livePrices[r.ticker] && livePrices[r.ticker] !== 'loading' ? livePrices[r.ticker].price : null}
          derivedPrice={derived[r.id]?.adjustedPrice}
          onChange={fields => onUpdateRow(r.id, fields)}
        />
      ) },
    { id: 'fee', label: 'Fee',  minWidth: 120,
      render: r => (
        <FeeCell
          value={r.manualFeeOverride}
          resolved={derived[r.id]?.feeAmount}
          onChange={raw => onUpdateRow(r.id, { manualFeeOverride: raw === '' ? null : Number(raw) })}
          override={r.manualFeeOverride != null && r.manualFeeOverride !== ''}
        />
      ) },
    { id: 'feePct', label: 'Fee %', minWidth: 70, align: 'right',
      render: r => fmtPct(derived[r.id]?.feePct) },
    { id: 'fwdYield', label: 'Forward div %', minWidth: 90, align: 'right',
      render: r => fmtPct(derived[r.id]?.dividend?.fwdPct) },
    { id: 'fwdMonthGross', label: 'Fwd / mo gross', minWidth: 110, align: 'right', defaultHidden: true,
      render: r => fmtNum(derived[r.id]?.dividend?.fwdMonthGross) },
    { id: 'fwdMonthNet', label: 'Fwd / mo net', minWidth: 100, align: 'right',
      render: r => fmtNum(derived[r.id]?.dividend?.fwdMonthNet) },
    { id: 'ttmYield', label: 'TTM div %', minWidth: 80, align: 'right', defaultHidden: true,
      render: r => fmtPct(derived[r.id]?.dividend?.ttmPct) },
    { id: 'ttmMonthGross', label: 'TTM / mo gross', minWidth: 110, align: 'right', defaultHidden: true,
      render: r => fmtNum(derived[r.id]?.dividend?.ttmMonthGross) },
    { id: 'ttmMonthNet', label: 'TTM / mo net', minWidth: 100, align: 'right', defaultHidden: true,
      render: r => fmtNum(derived[r.id]?.dividend?.ttmMonthNet) },
    { id: 'tradeGross', label: 'Trade gross', minWidth: 100, align: 'right',
      render: r => fmtNum(derived[r.id]?.gross) },
    { id: 'tradeNetOfFee', label: 'Net of fee', minWidth: 90, align: 'right',
      render: r => fmtNum(derived[r.id]?.netOfFee) },
    { id: 'tradeMain', label: `In ${mainCurrency}`, minWidth: 100, align: 'right', defaultHidden: true,
      render: r => fmtNum(derived[r.id]?.mainCurrencyValue) },
    { id: 'actions', label: '', minWidth: 100,
      render: r => (
        <div className={styles.rowActions}>
          {r.executedAt ? (
            <span className={styles.executedBadge} title={`Executed ${r.executedAt.slice(0, 10)}`}>✓ Done</span>
          ) : (
            <button
              className={styles.execBtn}
              onClick={() => onExecute(r)}
              disabled={!derived[r.id]?.adjustedPrice}
              title="Execute — record this as a real sell transaction"
            >▶ Execute</button>
          )}
          <button
            className={styles.rowDeleteBtn}
            onClick={() => onRemoveRow(r.id)}
            title="Remove row"
          >✕</button>
        </div>
      ) },
  ]
}

function buildBuyColumns({
  active, accounts, livePrices, derived, fxRatesEffective, mainCurrency,
  tickerYieldData, onUpdateRow, onRemoveRow, onTickerClick, onExecute,
}) {
  return [
    { id: 'include', label: '', minWidth: 28,
      render: r => (
        <input
          type="checkbox"
          checked={!!r.included}
          disabled={!!r.executedAt}
          onChange={e => onUpdateRow(r.id, { included: e.target.checked })}
        />
      ) },
    { id: 'ticker', label: 'Ticker', minWidth: 78, sortValue: r => r.ticker,
      render: r => (
        <button className={styles.tickerLink} onClick={() => onTickerClick(r.ticker)}>{r.ticker}</button>
      ) },
    { id: 'account', label: 'Account', minWidth: 180,
      render: r => (
        <select
          className={styles.cellSelect}
          value={r.investingAccountId}
          onChange={e => onUpdateRow(r.id, { investingAccountId: e.target.value })}
        >
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.institution} — {a.name}</option>
          ))}
        </select>
      ) },
    { id: 'shares', label: 'Shares to buy', minWidth: 110,
      render: r => (
        <input
          type="number"
          className={styles.cellInput}
          value={r.shares}
          min="0"
          step="any"
          onChange={e => onUpdateRow(r.id, { shares: Math.max(0, Number(e.target.value) || 0) })}
        />
      ) },
    { id: 'name', label: 'Name', minWidth: 150, defaultHidden: true,
      render: r => tickerYieldData[r.ticker]?.profileName ?? '—' },
    { id: 'exchange', label: 'Exchange', minWidth: 90, defaultHidden: true,
      render: r => r.stockExchange ?? tickerYieldData[r.ticker]?.profileExchange ?? '—' },
    { id: 'currency', label: 'Ccy', minWidth: 60,
      render: r => r.currency ?? '—' },
    { id: 'fxToMain', label: `FX → ${mainCurrency}`, minWidth: 90, defaultHidden: true,
      render: r => {
        if (!r.currency || r.currency === mainCurrency) return '—'
        return fmtRate(lookupFxRate(r.currency, mainCurrency, fxRatesEffective))
      } },
    { id: 'lastPrice', label: 'Last price', minWidth: 90, align: 'right',
      render: r => {
        const lp = livePrices[r.ticker]
        if (lp === 'loading') return <span className={styles.cellMuted}>…</span>
        if (!lp) return '—'
        return fmtNum(lp.price)
      } },
    { id: 'adjustedPrice', label: 'Adjusted price', minWidth: 180,
      render: r => (
        <AdjustedPriceCell
          row={r}
          lastPrice={livePrices[r.ticker] && livePrices[r.ticker] !== 'loading' ? livePrices[r.ticker].price : null}
          derivedPrice={derived[r.id]?.adjustedPrice}
          onChange={fields => onUpdateRow(r.id, fields)}
        />
      ) },
    { id: 'fee', label: 'Fee', minWidth: 120,
      render: r => (
        <FeeCell
          value={r.manualFeeOverride}
          resolved={derived[r.id]?.feeAmount}
          onChange={raw => onUpdateRow(r.id, { manualFeeOverride: raw === '' ? null : Number(raw) })}
          override={r.manualFeeOverride != null && r.manualFeeOverride !== ''}
        />
      ) },
    { id: 'feePct', label: 'Fee %', minWidth: 70, align: 'right',
      render: r => fmtPct(derived[r.id]?.feePct) },
    { id: 'pricePerShareIncFee', label: 'Buy px + fee/sh', minWidth: 110, align: 'right',
      render: r => fmtNum(derived[r.id]?.pricePerShareIncFee) },
    { id: 'fwdYield', label: 'Forward div %', minWidth: 90, align: 'right',
      render: r => fmtPct(derived[r.id]?.dividend?.fwdPct) },
    { id: 'fwdMonthGross', label: 'Fwd / mo gross', minWidth: 110, align: 'right', defaultHidden: true,
      render: r => fmtNum(derived[r.id]?.dividend?.fwdMonthGross) },
    { id: 'fwdMonthNet', label: 'Fwd / mo net', minWidth: 100, align: 'right',
      render: r => fmtNum(derived[r.id]?.dividend?.fwdMonthNet) },
    { id: 'ttmYield', label: 'TTM div %', minWidth: 80, align: 'right', defaultHidden: true,
      render: r => fmtPct(derived[r.id]?.dividend?.ttmPct) },
    { id: 'ttmMonthGross', label: 'TTM / mo gross', minWidth: 110, align: 'right', defaultHidden: true,
      render: r => fmtNum(derived[r.id]?.dividend?.ttmMonthGross) },
    { id: 'ttmMonthNet', label: 'TTM / mo net', minWidth: 100, align: 'right', defaultHidden: true,
      render: r => fmtNum(derived[r.id]?.dividend?.ttmMonthNet) },
    { id: 'tradeGross', label: 'Trade w/o fee', minWidth: 100, align: 'right',
      render: r => fmtNum(derived[r.id]?.gross) },
    { id: 'tradeWithFee', label: 'Trade w/ fee', minWidth: 100, align: 'right',
      render: r => fmtNum(derived[r.id]?.grossPlusFee) },
    { id: 'tradeMain', label: `In ${mainCurrency} (w/ fee)`, minWidth: 110, align: 'right', defaultHidden: true,
      render: r => fmtNum(derived[r.id]?.mainCurrencyValue) },
    { id: 'actions', label: '', minWidth: 100,
      render: r => (
        <div className={styles.rowActions}>
          {r.executedAt ? (
            <span className={styles.executedBadge} title={`Executed ${r.executedAt.slice(0, 10)}`}>✓ Done</span>
          ) : (
            <button
              className={styles.execBtn}
              onClick={() => onExecute(r)}
              disabled={!derived[r.id]?.adjustedPrice}
              title="Execute — record this as a real buy transaction"
            >▶ Execute</button>
          )}
          <button
            className={styles.rowDeleteBtn}
            onClick={() => onRemoveRow(r.id)}
            title="Remove row"
          >✕</button>
        </div>
      ) },
  ]
}

// ─── Adjusted-price cell ──────────────────────────────────────────────────────

function AdjustedPriceCell({ row, lastPrice, derivedPrice, onChange }) {
  const rule = row.adjustedPriceRule || 'last'
  return (
    <div className={styles.adjPriceCell}>
      <span className={styles.adjPriceValue}>{fmtNum(derivedPrice)}</span>
      <select
        className={styles.adjPriceSelect}
        value={rule}
        onChange={e => onChange({ adjustedPriceRule: e.target.value })}
      >
        <option value="last">Last</option>
        <option value="round-down">Round ↓</option>
        <option value="round-up">Round ↑</option>
        <option value="manual">Manual</option>
      </select>
      {(rule === 'round-down' || rule === 'round-up') && (
        <input
          type="number"
          className={styles.cellInputSm}
          min="0"
          max="6"
          step="1"
          value={row.adjustedPriceDecimals ?? 2}
          onChange={e => onChange({ adjustedPriceDecimals: Number(e.target.value) })}
          title="Decimal places"
        />
      )}
      {rule === 'manual' && (
        <input
          type="number"
          className={styles.cellInputSm}
          step="any"
          value={row.adjustedPriceManual ?? ''}
          onChange={e => onChange({ adjustedPriceManual: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder={lastPrice != null ? String(lastPrice) : ''}
        />
      )}
    </div>
  )
}

// ─── Fee cell ────────────────────────────────────────────────────────────────

function FeeCell({ value, resolved, onChange, override }) {
  const display = value != null && value !== '' ? value : (resolved ?? '')
  return (
    <div className={styles.feeCell} title="Defaults set in Settings → Investments → Trading fees. Edit per row to override for this scenario only.">
      <input
        type="number"
        step="any"
        min="0"
        className={styles.cellInput}
        value={display}
        onChange={e => onChange(e.target.value)}
        placeholder={resolved != null ? fmtNum(resolved) : '0'}
      />
      {override && <span className={styles.overrideDot} title="Manual override — click ↺ to revert" />}
      {override && (
        <button
          className={styles.revertBtn}
          onClick={() => onChange('')}
          title="Revert to default fee"
        >↺</button>
      )}
    </div>
  )
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }) {
  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{title}</h3>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Position picker (sells) ─────────────────────────────────────────────────

function PositionPicker({ accounts, openLotsMap, existingRows, onCancel, onPick }) {
  const [search, setSearch] = useState('')

  const positions = useMemo(() => {
    const byTicker = {}
    for (const acc of accounts) {
      const tickerMap = openLotsMap[acc.id] ?? {}
      for (const [ticker, info] of Object.entries(tickerMap)) {
        if (!info?.totalShares || info.totalShares <= 0) continue
        byTicker[ticker] = byTicker[ticker] ?? []
        byTicker[ticker].push({ accountId: acc.id, shares: info.totalShares })
      }
    }
    return Object.entries(byTicker)
      .map(([ticker, list]) => {
        const sorted = [...list].sort((a, b) => b.shares - a.shares)
        return { ticker, accounts: sorted, defaultAccount: sorted[0] }
      })
      .sort((a, b) => a.ticker.localeCompare(b.ticker))
  }, [accounts, openLotsMap])

  const q = search.trim().toUpperCase()
  const filtered = q ? positions.filter(p => p.ticker.startsWith(q)) : positions

  function accountLabel(id) {
    const a = accounts.find(x => x.id === id)
    return a ? `${a.institution} — ${a.name}` : '?'
  }

  function alreadyExists(ticker, accountId) {
    return existingRows.some(r => r.ticker === ticker && r.investingAccountId === accountId)
  }

  return (
    <ModalShell title="Pick a position to sell" onClose={onCancel}>
      <input
        autoFocus
        className={styles.modalInput}
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Filter by ticker…"
      />
      <div className={styles.pickerList}>
        {filtered.length === 0 ? (
          <p className={styles.pickerEmpty}>No matching open positions.</p>
        ) : (
          filtered.map(p => {
            const profile = getStockProfile(p.ticker)
            return (
              <button
                key={p.ticker}
                className={styles.pickerRow}
                disabled={alreadyExists(p.ticker, p.defaultAccount.accountId)}
                onClick={() => onPick({
                  ticker: p.ticker,
                  stockExchange: profile?.stockExchange ?? null,
                  currency: profile?.currency ?? null,
                  investingAccountId: p.defaultAccount.accountId,
                  shares: 0,
                })}
              >
                <span className={styles.pickerTicker}>{p.ticker}</span>
                <span className={styles.pickerAccount}>{accountLabel(p.defaultAccount.accountId)}</span>
                <span className={styles.pickerShares}>{fmtShares(p.defaultAccount.shares)} sh</span>
                {p.accounts.length > 1 && (
                  <span className={styles.pickerExtra}>+ {p.accounts.length - 1} more</span>
                )}
              </button>
            )
          })
        )}
      </div>
      <div className={styles.modalActions}>
        <button className={styles.modalCancel} onClick={onCancel}>Cancel</button>
      </div>
    </ModalShell>
  )
}

// ─── Stock picker (buys) ──────────────────────────────────────────────────────

function StockPicker({ profiles, accounts, defaultAccountId, onCancel, onPick }) {
  const [search, setSearch] = useState('')

  const list = useMemo(() => {
    return [...profiles].sort((a, b) => a.ticker.localeCompare(b.ticker))
  }, [profiles])

  const q = search.trim().toUpperCase()
  const filtered = q
    ? list.filter(p => p.ticker.startsWith(q) || (p.name ?? '').toUpperCase().includes(q))
    : list

  function pick(profile) {
    onPick({
      ticker: profile.ticker,
      stockExchange: profile.stockExchange ?? null,
      currency: profile.currency ?? null,
      investingAccountId: defaultAccountId,
      shares: 0,
    })
  }

  return (
    <ModalShell title="Pick a stock to buy" onClose={onCancel}>
      <input
        autoFocus
        className={styles.modalInput}
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Filter by ticker or name…"
      />
      <div className={styles.pickerList}>
        {filtered.length === 0 ? (
          <p className={styles.pickerEmpty}>
            No matching stocks. Add a new stock from <em>More → Stock inventory</em> first.
          </p>
        ) : (
          filtered.map(p => (
            <button key={p.ticker} className={styles.pickerRow} onClick={() => pick(p)}>
              <span className={styles.pickerTicker}>{p.ticker}</span>
              <span className={styles.pickerAccount}>{p.name ?? '—'}</span>
              <span className={styles.pickerExtra}>
                {[p.stockExchange, p.currency].filter(Boolean).join(' · ') || '—'}
              </span>
            </button>
          ))
        )}
      </div>
      <div className={styles.modalActions}>
        <button className={styles.modalCancel} onClick={onCancel}>Cancel</button>
      </div>
    </ModalShell>
  )
}

// ─── Execute modal ────────────────────────────────────────────────────────────

function ExecuteModal({ side, row, derived, accounts, activeId, mainCurrency, onClose, onDone }) {
  const account  = accounts.find(a => a.id === row.investingAccountId)
  const currency = row.currency ?? ''

  const [date,    setDate]    = useState(TODAY_ISO())
  const [shares,  setShares]  = useState(String(row.shares || ''))
  const [price,   setPrice]   = useState(() => {
    const p = derived?.adjustedPrice
    return p != null && Number.isFinite(p) ? String(p) : ''
  })
  const [fee,     setFee]     = useState(() => {
    const f = row.manualFeeOverride != null ? row.manualFeeOverride : (derived?.feeAmount ?? 0)
    return String(f)
  })
  const [extId,   setExtId]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)

  // Lot picker (sell only)
  const openLots    = side === 'sell' ? getOpenLots(row.investingAccountId, row.ticker) : []
  const [showLots,  setShowLots]  = useState(false)
  const [lotInputs, setLotInputs] = useState({})
  const [manualMode,setManualMode]= useState(false)

  const lotTotal = Object.values(lotInputs).reduce((s, v) => s + Number(v || 0), 0)
  const lotValid = !showLots || Math.abs(lotTotal - Number(shares || 0)) < 0.000001

  const numShares = Number(shares || 0)
  const numPrice  = Number(price  || 0)
  const numFee    = Number(fee    || 0)

  // Balance preview
  const cashBal     = account ? getCashBalanceByCurrency(account.id, currency) : null
  const currentBal  = cashBal ? getCurrentBalance(cashBal.id) : null
  const netImpact   = side === 'sell'
    ? numShares * numPrice - numFee
    : -(numShares * numPrice + numFee)
  const projectedBal = currentBal != null ? currentBal + netImpact : null

  const canSave = numShares > 0 && numPrice > 0 && currency && !saving && lotValid

  function handleSharesChange(value) {
    setShares(value)
    if (side === 'sell' && showLots && !manualMode && openLots.length > 0) {
      const n = Number(value || 0)
      const inputs = {}
      if (n > 0) {
        const { allocations } = computeFifoAllocations(openLots, n)
        for (const a of allocations) inputs[a.sourceBuyId] = String(a.sharesFromLot)
      }
      for (const lot of openLots) if (!(lot.id in inputs)) inputs[lot.id] = '0'
      setLotInputs(inputs)
    }
  }

  function handleLotChange(lotId, raw) {
    const lot = openLots.find(l => l.id === lotId)
    if (!lot) return
    let clamped = raw
    const n = Number(raw)
    if (Number.isFinite(n) && n > lot.remainingShares) clamped = String(lot.remainingShares)
    const next = { ...lotInputs, [lotId]: clamped }
    setLotInputs(next)
    setManualMode(true)
    const sum = Object.values(next).reduce((s, v) => s + Number(v || 0), 0)
    setShares(sum > 0 ? fmtShares(sum) : '')
  }

  function toggleLots() {
    if (!showLots) {
      const n = Number(shares || 0)
      const inputs = {}
      if (n > 0 && openLots.length > 0) {
        const { allocations } = computeFifoAllocations(openLots, n)
        for (const a of allocations) inputs[a.sourceBuyId] = String(a.sharesFromLot)
      }
      for (const lot of openLots) if (!(lot.id in inputs)) inputs[lot.id] = '0'
      setLotInputs(inputs)
      setManualMode(false)
    }
    setShowLots(v => !v)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const exchangeRates = await snapshotFxRates(currency, date, mainCurrency)
      let txn
      const common = {
        date,
        ticker: row.ticker,
        stockExchange: row.stockExchange || null,
        investingAccountId: row.investingAccountId,
        shares: numShares,
        price: numPrice,
        currency,
        fee: numFee,
        transactionExternalId: extId.trim() || null,
        exchangeRates,
      }
      if (side === 'buy') {
        txn = createBuy(common)
      } else {
        const lotAllocations = showLots
          ? Object.entries(lotInputs)
              .filter(([, v]) => Number(v) > 0)
              .map(([sourceBuyId, v]) => ({ sourceBuyId, sharesFromLot: Number(v) }))
          : null
        txn = createSell({ ...common, lotAllocations })
      }
      markRowExecuted(activeId, side, row.id, txn.id)
      onDone()
    } catch (err) {
      setError(err?.message || 'Execution failed. Check the console for details.')
      setSaving(false)
    }
  }

  const accountLabel = account ? `${account.institution} — ${account.name}` : '?'

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Execute {side} — {row.ticker}</h3>
          <button className={styles.modalClose} onClick={onClose} disabled={saving}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.execFormBody}>
            <div className={styles.execField}>
              <span className={styles.execLabel}>Account</span>
              <span className={styles.execLocked}>{accountLabel}</span>
            </div>
            <div className={styles.execField}>
              <span className={styles.execLabel}>Currency</span>
              <span className={styles.execLocked}>{currency}</span>
            </div>
            <div className={styles.execField}>
              <span className={styles.execLabel}>Date</span>
              <input className={styles.execInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className={styles.execField}>
              <span className={styles.execLabel}>Shares</span>
              <input className={styles.execInput} type="number" min="0.000001" step="any" value={shares} onChange={e => handleSharesChange(e.target.value)} />
            </div>
            <div className={styles.execField}>
              <span className={styles.execLabel}>Price per share</span>
              <input className={styles.execInput} type="number" min="0.000001" step="any" value={price} onChange={e => setPrice(e.target.value)} />
            </div>
            <div className={styles.execField}>
              <span className={styles.execLabel}>Fee ({currency})</span>
              <input className={styles.execInput} type="number" min="0" step="0.01" value={fee} onChange={e => setFee(e.target.value)} />
            </div>
            <div className={styles.execField}>
              <span className={styles.execLabel}>Transaction ID</span>
              <input className={styles.execInput} value={extId} onChange={e => setExtId(e.target.value)} placeholder="Optional broker reference" />
            </div>

            {side === 'sell' && openLots.length > 0 && (
              <div className={styles.execLotSection}>
                <button type="button" className={styles.execLotToggle} onClick={toggleLots}>
                  {showLots ? '▲' : '▼'} Advanced: choose lots
                </button>
                {showLots && (
                  <div className={styles.execLotList}>
                    {openLots.map(lot => (
                      <div key={lot.id} className={styles.execLotRow}>
                        <span className={styles.execLotMeta}>{lot.date} · {fmtShares(lot.remainingShares)} sh @ {fmtNum(lot.price)}</span>
                        <input
                          className={styles.execLotInput}
                          type="number" min="0" max={lot.remainingShares} step="any"
                          value={lotInputs[lot.id] ?? '0'}
                          onChange={e => handleLotChange(lot.id, e.target.value)}
                        />
                        <span className={styles.execLotMaxHint}>max {fmtShares(lot.remainingShares)}</span>
                      </div>
                    ))}
                    {!lotValid && (
                      <p className={styles.execFieldError}>
                        Lot totals ({fmtShares(lotTotal)}) must equal shares ({shares}).
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {currentBal != null && (
              <div className={`${styles.execBalPreview} ${projectedBal < 0 ? styles.execBalNegative : ''}`}>
                {currency} balance: {fmtNum(currentBal)} → <strong>{fmtNum(projectedBal)}</strong>
                {projectedBal < 0 && ' — will go negative'}
              </div>
            )}

            {error && <p className={styles.execFieldError}>{error}</p>}
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className={styles.modalPrimary} disabled={!canSave}>
              {saving ? 'Saving…' : `Execute ${side}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtNum(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n, withSign = false) {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = withSign && n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}
function fmtRate(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(4)
}
function fmtSigned(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${fmtNum(n)}`
}
function fmtShares(n) {
  if (!Number.isFinite(n) || n === 0) return '0'
  const fixed = n.toFixed(6)
  return Number(fixed).toString()
}
