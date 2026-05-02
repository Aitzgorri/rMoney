import { useState, useEffect, useMemo } from 'react'
import {
  getBenchmarks, createBenchmark, updateBenchmark,
  deleteBenchmark, CURATED_BENCHMARKS,
} from '../data/benchmarks'
import { computeMySeries, computeStats } from '../utils/portfolioHistory'
import { getIndexSeries, getHistoricalSeries } from '../data/marketDataClient'
import { getPortfoliosFlat } from '../data/portfolios'
import { getInvestingAccounts } from '../data/investingAccounts'
import { getPositions } from '../data/stockTransactions'
import { INDENT } from '../utils/hierarchy'
import styles from './Benchmarks.module.css'

const PERIODS = ['1M', '3M', '6M', '1Y', '5Y', 'All']
const PERIOD_RESOLUTION = {
  '1M': 'daily', '3M': 'daily', '6M': 'daily', '1Y': 'daily', '5Y': 'weekly', 'All': 'monthly',
}

export default function Benchmarks() {
  const portfoliosFlat = getPortfoliosFlat()

  // Held tickers — sync read from localStorage
  const heldTickers = useMemo(() => {
    const accounts = getInvestingAccounts()
    const tickers = new Set()
    for (const acc of accounts) {
      for (const pos of getPositions(acc.id)) tickers.add(pos.ticker)
    }
    return [...tickers].sort()
  }, [])

  const [scope,       setScope]       = useState('all')
  const [portfolioId, setPortfolioId] = useState(() => portfoliosFlat[0]?.id ?? '')
  const [stockTicker, setStockTicker] = useState(() => heldTickers[0] ?? '')
  const [benchmarkId, setBenchmarkId] = useState('sp500')
  const [period,      setPeriod]      = useState('1Y')

  const [mySeries,    setMySeries]    = useState(null)
  const [myStatus,    setMyStatus]    = useState('idle') // 'idle'|'loading'|'empty'|'error'
  const [benchSeries, setBenchSeries] = useState(null)
  const [benchStatus, setBenchStatus] = useState('idle')

  const [benchmarks,     setBenchmarks]     = useState(() => getBenchmarks())
  const [addForm,        setAddForm]        = useState(null) // null | { ticker, displayName }
  const [addError,       setAddError]       = useState('')
  const [editingId,      setEditingId]      = useState(null)
  const [editName,       setEditName]       = useState('')
  const [deleteConfirm,  setDeleteConfirm]  = useState(null) // id or null

  const selectedBenchmark = benchmarks.find(b => b.id === benchmarkId) ?? benchmarks[0]
  const myStats    = computeStats(mySeries)
  const benchStats = computeStats(benchSeries)

  // ── Fetch "my series" when scope / param / period changes ─────────────────────
  useEffect(() => {
    const param = scope === 'portfolio' ? portfolioId : scope === 'stock' ? stockTicker : null
    if ((scope === 'portfolio' && !portfolioId) || (scope === 'stock' && !stockTicker)) {
      setMyStatus('empty')
      setMySeries(null)
      return
    }

    let cancelled = false
    setMyStatus('loading')
    setMySeries(null)

    computeMySeries(scope, param, period)
      .then(series => {
        if (cancelled) return
        if (!series) setMyStatus('empty')
        else { setMySeries(series); setMyStatus('idle') }
      })
      .catch(() => { if (!cancelled) setMyStatus('error') })

    return () => { cancelled = true }
  }, [scope, portfolioId, stockTicker, period])

  // ── Fetch benchmark series when benchmark / period changes ────────────────────
  useEffect(() => {
    if (!selectedBenchmark) return
    let cancelled = false
    setBenchStatus('loading')
    setBenchSeries(null)

    const resolution = PERIOD_RESOLUTION[period] ?? 'daily'
    const fetch = selectedBenchmark.curated
      ? getIndexSeries(selectedBenchmark.ticker, period, resolution)
      : getHistoricalSeries(selectedBenchmark.ticker, selectedBenchmark.exchange ?? null, period, resolution)

    fetch
      .then(raw => {
        if (cancelled) return
        if (!raw || raw.length < 2) { setBenchStatus('empty'); return }
        const start = raw[0].close
        if (!start) { setBenchStatus('empty'); return }
        setBenchSeries(raw.map(p => ({ date: p.date, value: (100 * p.close) / start })))
        setBenchStatus('idle')
      })
      .catch(() => { if (!cancelled) setBenchStatus('error') })

    return () => { cancelled = true }
  }, [selectedBenchmark?.id, period])

  // ── Benchmark CRUD handlers ───────────────────────────────────────────────────
  function handleAdd() {
    const { ticker, displayName } = addForm
    if (!ticker.trim()) { setAddError('Ticker is required'); return }
    createBenchmark(ticker, displayName)
    setBenchmarks(getBenchmarks())
    setAddForm(null)
    setAddError('')
  }

  function handleSaveEdit(id) {
    updateBenchmark(id, { displayName: editName })
    setBenchmarks(getBenchmarks())
    setEditingId(null)
  }

  function handleDelete(id) {
    deleteBenchmark(id)
    setBenchmarks(getBenchmarks())
    if (benchmarkId === id) setBenchmarkId('sp500')
    setDeleteConfirm(null)
  }

  // ── Scope label for chart legend ──────────────────────────────────────────────
  const myLabel = scope === 'stock'
    ? stockTicker
    : scope === 'portfolio'
      ? (portfoliosFlat.find(p => p.id === portfolioId)?.name ?? 'Portfolio')
      : 'My portfolio'

  // ── Loading/empty state for chart section ─────────────────────────────────────
  const chartLoading = myStatus === 'loading' || benchStatus === 'loading'
  const chartStatus  = chartLoading ? 'loading' : 'idle'

  return (
    <div className={styles.screen}>
      <div className={styles.title}>Benchmarks</div>

      {/* ── Comparison controls ─────────────────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>Compare</div>

        {/* Scope selector */}
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Show</span>
          <div className={styles.scopeGroup}>
            <label className={styles.scopeLabel}>
              <input type="radio" name="scope" value="all"
                checked={scope === 'all'} onChange={() => setScope('all')} />
              Whole portfolio
            </label>
            <label className={styles.scopeLabel}>
              <input type="radio" name="scope" value="portfolio"
                checked={scope === 'portfolio'} onChange={() => setScope('portfolio')} />
              Portfolio
            </label>
            <label className={styles.scopeLabel}>
              <input type="radio" name="scope" value="stock"
                checked={scope === 'stock'} onChange={() => setScope('stock')} />
              Stock
            </label>
          </div>

          {scope === 'portfolio' && (
            <select
              className={styles.subSelect}
              value={portfolioId}
              onChange={e => setPortfolioId(e.target.value)}
            >
              {portfoliosFlat.length === 0
                ? <option value="">No portfolios</option>
                : portfoliosFlat.map(p => (
                  <option key={p.id} value={p.id}>
                    {INDENT.repeat(p.depth)}{p.name}
                  </option>
                ))
              }
            </select>
          )}

          {scope === 'stock' && (
            <select
              className={styles.subSelect}
              value={stockTicker}
              onChange={e => setStockTicker(e.target.value)}
            >
              {heldTickers.length === 0
                ? <option value="">No positions</option>
                : heldTickers.map(t => <option key={t} value={t}>{t}</option>)
              }
            </select>
          )}
        </div>

        {/* Benchmark + period selectors */}
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>vs.</span>
          <select
            className={styles.benchSelect}
            value={benchmarkId}
            onChange={e => setBenchmarkId(e.target.value)}
          >
            <optgroup label="Curated">
              {CURATED_BENCHMARKS.map(b => (
                <option key={b.id} value={b.id}>{b.displayName}</option>
              ))}
            </optgroup>
            {benchmarks.some(b => !b.curated) && (
              <optgroup label="My benchmarks">
                {benchmarks.filter(b => !b.curated).map(b => (
                  <option key={b.id} value={b.id}>{b.displayName} ({b.ticker})</option>
                ))}
              </optgroup>
            )}
          </select>

          <div className={styles.periodBar}>
            {PERIODS.map(p => (
              <button
                key={p}
                className={`${styles.periodBtn} ${period === p ? styles.periodBtnActive : ''}`}
                onClick={() => setPeriod(p)}
              >{p}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Chart + stats ────────────────────────────────────────────────────── */}
      <div className={styles.card}>
        <BenchmarkChart
          mySeries={mySeries}
          benchSeries={benchSeries}
          myLabel={myLabel}
          benchLabel={selectedBenchmark?.displayName ?? ''}
          status={chartStatus}
          myStatus={myStatus}
          benchStatus={benchStatus}
          scope={scope}
        />

        {/* Stats table */}
        {(myStats || benchStats) && (
          <>
            <div className={styles.statsTable}>
              <div className={styles.statsHeader}>
                <div className={styles.statsHeaderCell}>Series</div>
                <div className={styles.statsHeaderCell}>Total return</div>
                <div className={styles.statsHeaderCell}>P.a. return</div>
                <div className={styles.statsHeaderCell}>Volatility</div>
              </div>
              {myStats && (
                <StatsRow
                  label={myLabel}
                  stats={myStats}
                  color="#3b82f6"
                />
              )}
              {benchStats && (
                <StatsRow
                  label={selectedBenchmark?.displayName ?? 'Benchmark'}
                  stats={benchStats}
                  color="#34d399"
                />
              )}
            </div>
            <p className={styles.currencyNote}>
              Both series indexed to 100 at period start — comparison shows return % only.
            </p>
          </>
        )}
      </div>

      {/* ── Benchmark list ────────────────────────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.listHeader}>
          <div className={styles.cardTitle}>Benchmark list</div>
          {!addForm && (
            <button className={styles.btnSm} onClick={() => { setAddForm({ ticker: '', displayName: '' }); setAddError('') }}>
              + Add benchmark
            </button>
          )}
        </div>

        {addForm && (
          <div className={styles.addForm}>
            <div className={styles.addFormRow}>
              <input
                className={styles.addInput}
                placeholder="Ticker (e.g. VTI)"
                value={addForm.ticker}
                onChange={e => setAddForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                autoFocus
              />
              <input
                className={styles.addInput}
                placeholder="Display name (optional)"
                value={addForm.displayName}
                onChange={e => setAddForm(f => ({ ...f, displayName: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAddForm(null); setAddError('') } }}
              />
              <button className={styles.btnPrimary} onClick={handleAdd} disabled={!addForm.ticker.trim()}>
                Add
              </button>
              <button className={styles.btnSmSec} onClick={() => { setAddForm(null); setAddError('') }}>
                Cancel
              </button>
            </div>
            {addError && <span style={{ fontSize: 12, color: '#f87171' }}>{addError}</span>}
          </div>
        )}

        <div className={styles.benchmarkList}>
          {benchmarks.map(b => (
            <div key={b.id} className={styles.benchmarkRow}>
              {editingId === b.id ? (
                <>
                  <input
                    className={`${styles.addInput} ${styles.renameInput}`}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(b.id); if (e.key === 'Escape') setEditingId(null) }}
                    autoFocus
                  />
                  <button className={styles.btnPrimary} onClick={() => handleSaveEdit(b.id)}>Save</button>
                  <button className={styles.btnSmSec} onClick={() => setEditingId(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <div className={styles.benchmarkInfo}>
                    <span className={styles.benchmarkName}>{b.displayName}</span>
                    <span className={styles.benchmarkTicker}>{b.ticker}</span>
                    {b.curated && <span className={styles.curatedBadge}>curated</span>}
                  </div>
                  {!b.curated && deleteConfirm === b.id ? (
                    <div className={styles.benchmarkActions}>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>Remove?</span>
                      <button className={styles.btnSmDanger} onClick={() => handleDelete(b.id)}>Yes</button>
                      <button className={styles.btnSmSec} onClick={() => setDeleteConfirm(null)}>No</button>
                    </div>
                  ) : (
                    <div className={styles.benchmarkActions}>
                      {!b.curated && (
                        <>
                          <button className={styles.btnSmSec} onClick={() => { setEditingId(b.id); setEditName(b.displayName) }}>
                            Edit
                          </button>
                          <button className={styles.btnSmDanger} onClick={() => setDeleteConfirm(b.id)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Stats row ────────────────────────────────────────────────────────────────

function StatsRow({ label, stats, color }) {
  function fmtPct(v) {
    if (v == null || isNaN(v)) return '—'
    const sign = v >= 0 ? '+' : ''
    return `${sign}${v.toFixed(1)}%`
  }

  return (
    <div className={styles.statsRow}>
      <div className={styles.statsLabelCell}>
        <span className={styles.statsColorDot} style={{ background: color }} />
        {label}
      </div>
      <div className={`${styles.statsValueCell} ${stats.totalReturn >= 0 ? styles.positive : styles.negative}`}>
        {fmtPct(stats.totalReturn)}
      </div>
      <div className={`${styles.statsValueCell} ${stats.paReturn >= 0 ? styles.positive : styles.negative}`}>
        {fmtPct(stats.paReturn)} p.a.
      </div>
      <div className={styles.statsValueCell}>
        {stats.volatility.toFixed(1)}% vol.
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function noSeriesMsg(scope) {
  if (scope === 'portfolio')
    return 'No data — assign stocks to this portfolio in the Portfolios screen first.'
  if (scope === 'stock')
    return 'No price history available for this stock and period.'
  return 'No open positions found in any investing account.'
}

// ─── Benchmark chart ──────────────────────────────────────────────────────────

function BenchmarkChart({ mySeries, benchSeries, myLabel, benchLabel, myStatus, benchStatus, scope }) {
  const [hover, setHover] = useState(null)

  const loading = myStatus === 'loading' || benchStatus === 'loading'
  const hasData = (mySeries?.length >= 2) || (benchSeries?.length >= 2)

  if (loading) return <div className={styles.chartEmpty}>Loading…</div>
  if (!hasData) {
    const msg =
      benchStatus === 'empty' ? 'No data available for this benchmark and period.' :
      benchStatus === 'error' ? 'Could not load benchmark data.' :
      myStatus === 'empty'    ? noSeriesMsg(scope) :
      myStatus === 'error'    ? 'Could not load portfolio data.' :
      'No data available.'
    return <div className={styles.chartEmpty}>{msg}</div>
  }

  // When benchmark loaded but "my series" is missing, show a note inside the chart area
  const mySeriesMissing = !mySeries && (myStatus === 'empty' || myStatus === 'error')

  const VW = 800, VH = 220
  const LPAD = 52, RPAD = 8, TPAD = 8, BPAD = 22
  const CW = VW - LPAD - RPAD
  const CH = VH - TPAD - BPAD

  const allPts = [...(mySeries ?? []), ...(benchSeries ?? [])]
  const allTs  = allPts.map(p => new Date(p.date).getTime())
  const minTs  = Math.min(...allTs)
  const maxTs  = Math.max(...allTs)
  const tsRange = maxTs - minTs || 1

  const allValues = allPts.map(p => p.value)
  const rawMin = Math.min(...allValues)
  const rawMax = Math.max(...allValues)
  const pad = (rawMax - rawMin) * 0.05 || 5
  const minVal = rawMin - pad
  const maxVal = rawMax + pad
  const valRange = maxVal - minVal || 1

  const toX = date => LPAD + ((new Date(date).getTime() - minTs) / tsRange) * CW
  const toY = v    => TPAD + (1 - (v - minVal) / valRange) * CH

  const buildPts = series =>
    series?.map(p => `${toX(p.date).toFixed(1)},${toY(p.value).toFixed(1)}`).join(' ') ?? ''

  const myPts    = buildPts(mySeries)
  const benchPts = buildPts(benchSeries)

  const yTicks = [0, 1/3, 2/3, 1].map(frac => ({
    value: minVal + frac * valRange,
    y: toY(minVal + frac * valRange),
  }))

  const allDates = [...new Set(allPts.map(p => p.date))].sort()
  const numX = Math.min(5, allDates.length)
  const xTicks = Array.from({ length: numX }, (_, i) => {
    const idx  = Math.round((i / Math.max(1, numX - 1)) * (allDates.length - 1))
    const date = allDates[Math.min(idx, allDates.length - 1)]
    return { x: toX(date), date }
  })

  const baseline100Y = toY(100)

  function fmtDateShort(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  function fmtDateFull(iso) {
    const d = new Date(iso)
    const day   = d.getDate()
    const month = d.toLocaleDateString('en-GB', { month: 'short' })
    const year  = d.getFullYear()
    return `${day} ${month} ${year}`
  }

  function handleMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * VW
    if (svgX < LPAD || svgX > VW - RPAD) { setHover(null); return }

    const frac = (svgX - LPAD) / CW
    const targetTs = minTs + frac * tsRange

    let nearest = null, nearestDist = Infinity
    for (const date of allDates) {
      const dist = Math.abs(new Date(date).getTime() - targetTs)
      if (dist < nearestDist) { nearestDist = dist; nearest = date }
    }
    if (!nearest) { setHover(null); return }

    const myPt    = mySeries?.find(p => p.date === nearest) ?? null
    const benchPt = benchSeries?.find(p => p.date === nearest) ?? null
    setHover({ date: nearest, x: toX(nearest), myVal: myPt?.value, benchVal: benchPt?.value })
  }

  let tooltipEl = null
  if (hover) {
    const TH = 52
    const TW = 150
    let tx = hover.x - TW / 2
    let ty = TPAD + 4
    if (tx < LPAD + 2) tx = LPAD + 2
    if (tx + TW > VW - RPAD) tx = VW - RPAD - TW

    tooltipEl = (
      <g pointerEvents="none">
        <line x1={hover.x.toFixed(1)} y1={TPAD} x2={hover.x.toFixed(1)} y2={TPAD + CH}
          stroke="#334155" strokeWidth="1" strokeDasharray="3,2" vectorEffect="non-scaling-stroke" />
        <rect x={tx.toFixed(1)} y={ty.toFixed(1)} width={TW} height={TH}
          rx="5" fill="#1e2d40" stroke="#334155" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <text x={(tx + 8).toFixed(1)} y={(ty + 13).toFixed(1)} fontSize="9" fill="#475569">
          {fmtDateFull(hover.date)}
        </text>
        {hover.myVal != null && (
          <g>
            <circle cx={(tx + 11).toFixed(1)} cy={(ty + 26).toFixed(1)} r="3" fill="#3b82f6" />
            <text x={(tx + 18).toFixed(1)} y={(ty + 30).toFixed(1)} fontSize="11" fill="#93c5fd">
              {hover.myVal.toFixed(1)}
            </text>
          </g>
        )}
        {hover.benchVal != null && (
          <g>
            <circle cx={(tx + 80).toFixed(1)} cy={(ty + 26).toFixed(1)} r="3" fill="#34d399" />
            <text x={(tx + 87).toFixed(1)} y={(ty + 30).toFixed(1)} fontSize="11" fill="#6ee7b7">
              {hover.benchVal.toFixed(1)}
            </text>
          </g>
        )}
        <text x={(tx + 8).toFixed(1)} y={(ty + 46).toFixed(1)} fontSize="9" fill="#334155">
          indexed, base 100
        </text>
      </g>
    )
  }

  return (
    <div className={styles.chartWrap}>
      <div className={styles.legend}>
        {mySeries && (
          <span className={styles.legendItem}>
            <span className={styles.legendDotBlue} />{myLabel}
          </span>
        )}
        {benchSeries && (
          <span className={styles.legendItem}>
            <span className={styles.legendDotGreen} />{benchLabel}
          </span>
        )}
        {mySeriesMissing && (
          <span className={styles.legendMissing}>{noSeriesMsg(scope)}</span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className={styles.chartSvg}
        style={{ cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Y-axis grid lines + labels */}
        {yTicks.map(({ value, y }, i) => (
          <g key={i}>
            <line x1={LPAD} y1={y.toFixed(1)} x2={VW - RPAD} y2={y.toFixed(1)}
              stroke="#1e293b" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <text x={LPAD - 6} y={(y + 4).toFixed(1)}
              textAnchor="end" fontSize="11" fill="#475569">
              {value.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Baseline 100 dashed reference line */}
        {baseline100Y >= TPAD && baseline100Y <= TPAD + CH && (
          <line x1={LPAD} y1={baseline100Y.toFixed(1)} x2={VW - RPAD} y2={baseline100Y.toFixed(1)}
            stroke="#334155" strokeWidth="1" strokeDasharray="4,3"
            vectorEffect="non-scaling-stroke" />
        )}

        {/* X-axis date labels */}
        {xTicks.map(({ x, date }, i) => (
          <text key={i}
            x={x.toFixed(1)} y={(VH - 5).toFixed(1)}
            textAnchor={i === 0 ? 'start' : i === numX - 1 ? 'end' : 'middle'}
            fontSize="11" fill="#475569"
          >{fmtDateShort(date)}</text>
        ))}

        {/* My series — blue */}
        {mySeries?.length >= 2 && (
          <polyline points={myPts} fill="none" stroke="#3b82f6" strokeWidth="2"
            vectorEffect="non-scaling-stroke" />
        )}

        {/* Benchmark series — green */}
        {benchSeries?.length >= 2 && (
          <polyline points={benchPts} fill="none" stroke="#34d399" strokeWidth="2"
            vectorEffect="non-scaling-stroke" />
        )}

        {/* Hover dots */}
        {hover?.myVal != null && (
          <circle cx={hover.x.toFixed(1)} cy={toY(hover.myVal).toFixed(1)}
            r="4" fill="#3b82f6" stroke="#0f172a" strokeWidth="1.5"
            vectorEffect="non-scaling-stroke" />
        )}
        {hover?.benchVal != null && (
          <circle cx={hover.x.toFixed(1)} cy={toY(hover.benchVal).toFixed(1)}
            r="4" fill="#34d399" stroke="#0f172a" strokeWidth="1.5"
            vectorEffect="non-scaling-stroke" />
        )}

        {tooltipEl}
      </svg>
    </div>
  )
}
