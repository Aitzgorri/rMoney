import { useState, useEffect, useCallback } from 'react'
import { getStockTransactionsByTicker, getPositions, applySplit } from '../data/stockTransactions'
import { getDividendsByTicker, computeDividendDerived, resolveDividendTaxPercent } from '../data/dividends'
import { getInvestingAccounts } from '../data/investingAccounts'
import { getAllPortfolioAssignments, getPortfolios } from '../data/portfolios'
import { getStockProfile, upsertStockProfile, getManualPrice, setManualPrice, clearManualPrice, renameTicker } from '../data/stockProfiles'
import { getLatestPrice, getHistoricalSeries, getNews } from '../data/marketDataClient'
import { getMainCurrency, getDividendEstimationRule } from '../data/settings'
import { computeProjections } from '../utils/dividendProjections'
import { convertToMain, ensureRates } from '../utils/currency'
import { fmtAmt } from '../utils/format'
import AiChatPanel from '../components/AiChatPanel'
import StockProfileResolutionDialog from '../components/StockProfileResolutionDialog'
import TickerRenameDialog from '../components/TickerRenameDialog'
import styles from './StockPage.module.css'

function fmtPct(n) {
  if (n == null || !isFinite(n)) return '—'
  const sign = n >= 0 ? '+' : '-'
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ')
  return `${sign}${abs}%`
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
  const [manualPriceForm, setManualPriceForm] = useState(null)   // null | { amount: string, currency: string }
  const [manualPriceKey,  setManualPriceKey]  = useState(0)      // bump to re-read manual price after save/clear
  const [livePrice,       setLivePrice]       = useState(null)   // null | { price, currency, asOf, providerName }
  const [priceStatus,     setPriceStatus]     = useState('idle') // 'idle' | 'loading' | 'unavailable'
  const [chartPeriod,     setChartPeriod]     = useState('6M')
  const [chartData,       setChartData]       = useState([])
  const [chartStatus,     setChartStatus]     = useState('idle') // 'idle' | 'loading' | 'unavailable'
  const [news,            setNews]            = useState([])
  const [newsStatus,      setNewsStatus]      = useState('idle') // 'idle' | 'loading' | 'unavailable'
  const [ratesVersion,    setRatesVersion]    = useState(0)

  const norm = ticker?.trim().toUpperCase() ?? ''

  // profileKey / manualPriceKey state bumps force re-renders; reads below stay fresh each render
  const profile     = getStockProfile(norm)
  const manualPrice = getManualPrice(norm)

  const fetchPrice = useCallback(async (forceRefresh = false) => {
    if (manualPrice) return   // manual override in place — no API call needed
    setPriceStatus('loading')
    try {
      const result = await getLatestPrice(norm, profile?.stockExchange ?? null, { forceRefresh })
      setLivePrice(result)
      setPriceStatus('idle')
    } catch {
      setPriceStatus('unavailable')
    }
  }, [norm, profile?.stockExchange, manualPrice])

  useEffect(() => { fetchPrice() }, [fetchPrice])

  const PERIOD_RESOLUTION = { '1M': 'daily', '3M': 'daily', '6M': 'daily', '1Y': 'daily', '5Y': 'weekly', 'All': 'monthly' }

  useEffect(() => {
    let cancelled = false
    setChartStatus('loading')
    setChartData([])
    getHistoricalSeries(norm, profile?.stockExchange ?? null, chartPeriod, PERIOD_RESOLUTION[chartPeriod])
      .then(data => { if (!cancelled) { setChartData(data ?? []); setChartStatus('idle') } })
      .catch(() => { if (!cancelled) setChartStatus('unavailable') })
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

  const accounts     = getInvestingAccounts()
  const accountsById = Object.fromEntries(accounts.map(a => [a.id, a]))
  const positions    = accounts.flatMap(acc => {
    const pos = getPositions(acc.id).find(p => p.ticker === norm)
    return pos ? [{ account: acc, pos }] : []
  })

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
  const effectivePrice = manualPrice
    ? { price: manualPrice.amount, currency: manualPrice.currency }
    : livePrice ?? null
  const totalShares         = positions.reduce((s, { pos }) => s + pos.shares, 0)
  const posCurrency         = positions[0]?.pos.currency ?? null
  const totalInvestedNative = positions.reduce((s, { pos }) => s + pos.shares * pos.avgCost, 0)
  const totalInvested       = posCurrency ? (convertToMain(totalInvestedNative, posCurrency, mainCurrency) ?? null) : null
  const marketValueNative   = effectivePrice != null ? totalShares * effectivePrice.price : null
  const priceCurrency       = effectivePrice?.currency ?? posCurrency
  const marketValue         = (marketValueNative != null && priceCurrency) ? (convertToMain(marketValueNative, priceCurrency, mainCurrency) ?? null) : null
  const totalReturn         = (marketValue != null && totalInvested != null) ? marketValue - totalInvested : null
  const totalReturnPct      = (totalReturn != null && totalInvested != null && totalInvested > 0) ? (totalReturn / totalInvested) * 100 : null

  const cutoff12m = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10) })()
  let divReturnTotal = 0, div12m = 0
  for (const d of dividends) {
    const { netTotal } = computeDividendDerived(d)
    const conv = convertToMain(netTotal, d.currency, mainCurrency) ?? 0
    divReturnTotal += conv
    if (d.payoutDate >= cutoff12m) div12m += conv
  }
  const priceAppReturn = totalReturn != null ? totalReturn - divReturnTotal : null
  const divYieldTTM    = (div12m > 0 && marketValue != null && marketValue > 0) ? (div12m / marketValue) * 100 : null
  const firstBuyDate   = stockTxns.filter(t => t.type === 'buy').map(t => t.date).sort()[0] ?? null
  const paReturn       = (() => {
    if (firstBuyDate == null || totalReturnPct == null) return null
    const years = (Date.now() - new Date(firstBuyDate).getTime()) / (365.25 * 24 * 3600 * 1000)
    if (years < 0.0833) return null
    return (Math.pow(1 + totalReturnPct / 100, 1 / years) - 1) * 100
  })()

  // ── Dividend projections ────────────────────────────────────────────────────
  const globalEstRule  = getDividendEstimationRule()
  const effectiveRule  = profile?.amountEstimationRule ?? globalEstRule
  const projTaxPct     = resolveDividendTaxPercent(norm)
  const projections    = totalShares > 0
    ? computeProjections(dividends, { rule: effectiveRule, manualAmount: profile?.manualEstimatedAmount ?? null })
    : []

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
        <button
          className={styles.profileBtn}
          onClick={() => setResolving(true)}
          title={profile?.name ? 'Refresh profile' : 'Resolve profile'}
        >
          {profile?.name ? 'Refresh profile' : 'Resolve profile'}
        </button>
        <button
          className={styles.profileBtn}
          onClick={() => setRenaming(true)}
          title="Rename ticker"
        >
          Rename ticker
        </button>
      </div>

      {/* Price row */}
      <div className={styles.manualPriceRow}>
        {manualPrice ? (
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
          onConfirm={(newTicker, resolvedFields) => {
            renameTicker(norm, newTicker, resolvedFields)
            setRenaming(false)
            onNavigate('stock', { ticker: newTicker })
          }}
          onCancel={() => setRenaming(false)}
        />
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
                {['1M', '3M', '6M', '1Y', '5Y', 'All'].map(p => (
                  <button
                    key={p}
                    className={`${styles.chartPeriodBtn} ${chartPeriod === p ? styles.chartPeriodBtnActive : ''}`}
                    onClick={() => setChartPeriod(p)}
                  >{p}</button>
                ))}
              </div>
            </div>
            <PriceChart data={chartData} status={chartStatus} />
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
                    {marketValue != null
                      ? `${fmtAmt(marketValue)} ${mainCurrency}`
                      : <span className={styles.metricNa}>—</span>}
                  </div>
                </div>
                <div className={styles.metricTile}>
                  <div className={styles.metricLabel}>Total return</div>
                  <div className={`${styles.metricValue} ${totalReturn != null ? (totalReturn >= 0 ? styles.pos : styles.neg) : ''}`}>
                    {totalReturn != null
                      ? `${totalReturn >= 0 ? '+' : ''}${fmtAmt(Math.abs(totalReturn))} ${mainCurrency}`
                      : <span className={styles.metricNa}>—</span>}
                  </div>
                  {totalReturnPct != null && (
                    <div className={`${styles.metricSub} ${totalReturnPct >= 0 ? styles.pos : styles.neg}`}>
                      {fmtPct(totalReturnPct)}
                    </div>
                  )}
                </div>
                <div className={styles.metricTile}>
                  <div className={styles.metricLabel}>P.a. return</div>
                  <div className={`${styles.metricValue} ${paReturn != null ? (paReturn >= 0 ? styles.pos : styles.neg) : ''}`}>
                    {paReturn != null
                      ? fmtPct(paReturn)
                      : <span className={styles.metricNa}>{firstBuyDate && totalReturnPct != null ? '< 1 mo' : '—'}</span>}
                  </div>
                </div>
                <div className={styles.metricTile}>
                  <div className={styles.metricLabel}>Price appreciation</div>
                  <div className={`${styles.metricValue} ${priceAppReturn != null ? (priceAppReturn >= 0 ? styles.pos : styles.neg) : ''}`}>
                    {priceAppReturn != null
                      ? `${priceAppReturn >= 0 ? '+' : ''}${fmtAmt(Math.abs(priceAppReturn))} ${mainCurrency}`
                      : <span className={styles.metricNa}>—</span>}
                  </div>
                </div>
                <div className={styles.metricTile}>
                  <div className={styles.metricLabel}>Dividend return</div>
                  <div className={`${styles.metricValue} ${divReturnTotal > 0 ? styles.pos : ''}`}>
                    {divReturnTotal > 0
                      ? `+${fmtAmt(divReturnTotal)} ${mainCurrency}`
                      : <span className={styles.metricNa}>—</span>}
                  </div>
                </div>
                <div className={styles.metricTile}>
                  <div className={styles.metricLabel}>Div yield (TTM)</div>
                  <div className={styles.metricValue}>
                    {divYieldTTM != null
                      ? `${divYieldTTM.toFixed(2)}%`
                      : <span className={styles.metricNa}>—</span>}
                  </div>
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
              <div className={styles.txList}>
                {filteredTxns.map(t => (
                  <TxRow key={t.id} txn={t} accountsById={accountsById} />
                ))}
              </div>
            )}
          </div>

          {/* Dividends — past payouts + projections */}
          {dividends.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Dividends</div>

              {/* Past payouts */}
              {projections.length > 0 && <div className={styles.projSubLabel}>Past payouts</div>}
              <div className={styles.divList}>
                {dividends.map(d => {
                  const { netTotal } = computeDividendDerived(d)
                  const account = accountsById[d.investingAccountId]
                  return (
                    <div key={d.id} className={styles.divRow}>
                      <span className={styles.divDate}>{d.payoutDate}</span>
                      <span className={styles.divDesc}>
                        {fmtAmt(d.dividendPerShare)}/sh × {trimDec(d.shareCount)}
                        {d.taxPercent > 0 && ` (${d.taxPercent}% tax)`}
                      </span>
                      <span className={styles.divNet}>{fmtAmt(netTotal)} {d.currency}</span>
                      {account && <span className={styles.divAccount}>{account.name}</span>}
                    </div>
                  )
                })}
              </div>

              {/* Projected payouts */}
              {projections.length > 0 && (
                <>
                  <div className={styles.projRuleRow}>
                    <span className={styles.projSubLabel}>
                      Projected next {projections.length}
                    </span>
                    {projections[0]?.cadenceLabel && (
                      <span className={styles.projCadence}>({projections[0].cadenceLabel})</span>
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
                  </div>
                  <div className={styles.projList}>
                    {projections.map((p, i) => {
                      const derived = p.dividendPerShare != null
                        ? computeDividendDerived({ dividendPerShare: p.dividendPerShare, shareCount: totalShares, taxPercent: projTaxPct })
                        : null
                      return (
                        <div key={i} className={styles.projRow}>
                          <span className={styles.projDate}>{p.date}</span>
                          <span className={styles.projDesc}>
                            {p.dividendPerShare != null
                              ? `~${fmtAmt(p.dividendPerShare)}/sh × ${trimDec(totalShares)}${projTaxPct > 0 ? ` (${projTaxPct}% tax)` : ''}`
                              : '—'}
                          </span>
                          <span className={styles.projNet}>
                            {derived ? `~${fmtAmt(derived.netTotal)} ${p.currency}` : '—'}
                          </span>
                          <span className={`${styles.projBadge} ${
                            p.state === 'declared'         ? styles.projBadgeDeclared   :
                            p.state === 'amount estimated' ? styles.projBadgeAmountEst  :
                                                             styles.projBadgeEstimation
                          }`}>{p.state}</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {/* Need more history to project */}
              {dividends.length === 1 && totalShares > 0 && (
                <p className={styles.projNeedMore}>Record a second payout to enable date projections.</p>
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
                  const path = getPortfolioPath(a.portfolioId, allPortfolios)
                  return (
                    <div key={a.id} className={styles.portfolioRow}>
                      <span className={styles.portfolioPath}>{path}</span>
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

function TxRow({ txn, accountsById }) {
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

  return (
    <div className={styles.txRow}>
      <span className={styles.txDate}>{txn.date}</span>
      <span className={`${styles.txBadge} ${badgeCls}`}>{badge}</span>
      <span className={styles.txDesc}>{desc}</span>
      <span className={`${styles.txAmount} ${amountCls}`}>{amountStr}</span>
      {account && <span className={styles.txAccount}>{account.name}</span>}
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

// ─── Price chart ──────────────────────────────────────────────────────────────

function PriceChart({ data, status }) {
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
        >{fmtDateFull(hd.date)}</text>
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

        {/* X-axis date labels */}
        {xTicks.map(({ x, date, i }) => (
          <text
            key={i}
            x={x.toFixed(1)} y={(VH - 5).toFixed(1)}
            textAnchor={i === 0 ? 'start' : i === numX - 1 ? 'end' : 'middle'}
            fontSize="11" fill="#475569"
          >{fmtDateShort(date)}</text>
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
