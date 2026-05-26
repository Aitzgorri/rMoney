import { useState, useEffect } from 'react'
import {
  getActiveStockProfiles, getArchivedStockProfiles, upsertStockProfile, setConfirmed,
  archiveStockProfile, unarchiveStockProfile, deleteStockProfile, createManualStockProfile,
  getEffectiveHqCountry,
} from '../data/stockProfiles'
import { getStockTransactionsByTicker, hasOpenLotsForTicker } from '../data/stockTransactions'
import { getDividendsByTicker } from '../data/dividends'
import { getAllPortfolioAssignments } from '../data/portfolios'
import { getAllWatchlistEntries, deleteWatchlistEntriesForTicker } from '../data/watchlists'
import { deleteApiDividendHistoryForTicker } from '../data/apiDividendHistory'
import { deleteManualPricesForTicker } from '../data/manualPrices'
import { getLatestPrice } from '../data/marketDataClient'
import { fmtAmt } from '../utils/format'
import EditProfileDialog from '../components/EditProfileDialog'
import StockProfileResolutionDialog from '../components/StockProfileResolutionDialog'
import AddManualStockDialog from '../components/AddManualStockDialog'
import styles from './StockInventory.module.css'

const SORT_KEY    = 'rmoney_stock_inventory_sort'
const FILTER_KEY  = 'rmoney_stock_inventory_confirm_filter'

function loadSort() {
  try { return JSON.parse(localStorage.getItem(SORT_KEY)) ?? { key: 'ticker', dir: 'asc' } } catch { return { key: 'ticker', dir: 'asc' } }
}
function saveSort(s) { localStorage.setItem(SORT_KEY, JSON.stringify(s)) }

function loadConfirmFilter() {
  const v = localStorage.getItem(FILTER_KEY)
  return v === 'confirmed' || v === 'unconfirmed' ? v : 'all'
}
function saveConfirmFilter(v) { localStorage.setItem(FILTER_KEY, v) }

function detectDirection(input) {
  return /^[A-Z0-9.]{1,8}$/.test(input.trim().toUpperCase()) ? 'A' : 'B'
}

// `initialConfirmFilter` — optional override (e.g. CSV-import deep link passes
// 'unconfirmed'). Becomes the new persisted preference on arrival.
export default function StockInventory({ onNavigate, initialConfirmFilter }) {
  const [showArchived, setShowArchived] = useState(false)
  const [confirmFilter, setConfirmFilter] = useState(() => {
    const valid = ['all', 'confirmed', 'unconfirmed']
    return valid.includes(initialConfirmFilter) ? initialConfirmFilter : loadConfirmFilter()
  })
  const [sort, setSort] = useState(loadSort)
  const [profiles, setProfiles] = useState([])
  const [txCounts, setTxCounts] = useState({})
  const [divCounts, setDivCounts] = useState({})
  const [portfolioCounts, setPortfolioCounts] = useState({})
  const [watchlistCounts, setWatchlistCounts] = useState({})
  const [prices, setPrices] = useState({})       // { ticker: 'loading' | { price, currency } | null }
  const [editingTicker, setEditingTicker] = useState(null)
  const [deletingTicker, setDeletingTicker] = useState(null)
  const [deleteInput, setDeleteInput] = useState('')
  const [addInput, setAddInput] = useState('')
  const [addError, setAddError] = useState('')
  const [resolving, setResolving] = useState(null) // { ticker, direction }
  const [manualAddOpen, setManualAddOpen] = useState(false)

  // If a deep-link arrived with a filter override, persist it so the user's
  // next visit to this page remembers what brought them here.
  useEffect(() => {
    const valid = ['all', 'confirmed', 'unconfirmed']
    if (valid.includes(initialConfirmFilter)) saveConfirmFilter(initialConfirmFilter)
  }, [initialConfirmFilter])

  function refresh() {
    const list = showArchived ? getArchivedStockProfiles() : getActiveStockProfiles()
    setProfiles(list)

    // Build count maps in one pass each
    const allTx = list.flatMap(p => getStockTransactionsByTicker(p.ticker))
    const txMap = {}
    for (const t of allTx) { txMap[t.ticker] = (txMap[t.ticker] ?? 0) + 1 }

    const allDiv = list.flatMap(p => getDividendsByTicker(p.ticker))
    const divMap = {}
    for (const d of allDiv) { divMap[d.ticker] = (divMap[d.ticker] ?? 0) + 1 }

    const allAssignments = getAllPortfolioAssignments()
    const portMap = {}
    for (const a of allAssignments) { portMap[a.ticker] = (portMap[a.ticker] ?? 0) + 1 }

    const allEntries = getAllWatchlistEntries()
    const watchMap = {}
    for (const e of allEntries) { watchMap[e.ticker] = (watchMap[e.ticker] ?? 0) + 1 }

    setTxCounts(txMap)
    setDivCounts(divMap)
    setPortfolioCounts(portMap)
    setWatchlistCounts(watchMap)

    // Fire price lookups lazily per ticker. getLatestPrice consults the manual-
    // price override + the in-memory cache before hitting the network, so this
    // is cheap on second renders.
    setPrices(prev => {
      const next = { ...prev }
      for (const p of list) { if (next[p.ticker] === undefined) next[p.ticker] = 'loading' }
      return next
    })
    for (const p of list) {
      getLatestPrice(p.ticker, p.stockExchange ?? null)
        .then(r => setPrices(prev => ({ ...prev, [p.ticker]: { price: r.price, currency: r.currency, isStale: r.isStale ?? false, fetchedAt: r.asOf } })))
        .catch(() => setPrices(prev => ({ ...prev, [p.ticker]: null })))
    }
  }

  useEffect(() => { refresh() }, [showArchived])  // eslint-disable-line react-hooks/exhaustive-deps

  function handleConfirmFilter(v) {
    setConfirmFilter(v)
    saveConfirmFilter(v)
  }

  function handleToggleConfirmed(ticker, current) {
    setConfirmed(ticker, !current)
    refresh()
  }

  // ── Sort ──────────────────────────────────────────────────────────────────────

  function handleSort(key) {
    const next = sort.key === key && sort.dir === 'asc' ? { key, dir: 'desc' } : { key, dir: 'asc' }
    setSort(next)
    saveSort(next)
  }

  function sortIcon(key) {
    if (sort.key !== key) return <span className={styles.sortNeutral}>↕</span>
    return <span className={styles.sortActive}>{sort.dir === 'asc' ? '↑' : '↓'}</span>
  }

  // Apply the Confirmed filter pill before sorting.
  const filtered = profiles.filter(p => {
    if (confirmFilter === 'confirmed')   return p.confirmed === true
    if (confirmFilter === 'unconfirmed') return p.confirmed !== true
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const mul = sort.dir === 'asc' ? 1 : -1
    // Price column sorts numerically with missing values pushed last in both
    // directions; Confirmed sorts as boolean (true first when ascending).
    if (sort.key === 'price') {
      const av = prices[a.ticker]?.price
      const bv = prices[b.ticker]?.price
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return (av - bv) * mul
    }
    if (sort.key === 'confirmed') {
      return ((a.confirmed === true ? 1 : 0) - (b.confirmed === true ? 1 : 0)) * mul
    }
    // hqCountry sort must use the effective value (override takes priority over auto-fetched)
    const av = sort.key === 'hqCountry' ? (getEffectiveHqCountry(a) ?? '') : (a[sort.key] ?? '')
    const bv = sort.key === 'hqCountry' ? (getEffectiveHqCountry(b) ?? '') : (b[sort.key] ?? '')
    return String(av).localeCompare(String(bv)) * mul
  })

  // ── Add stock ─────────────────────────────────────────────────────────────────

  function handleAdd() {
    const val = addInput.trim()
    if (!val) return
    const direction = detectDirection(val)
    const query = direction === 'A' ? val.toUpperCase() : val
    setResolving({ ticker: query, direction })
    setAddError('')
  }

  function handleResolved(candidate) {
    const now = new Date().toISOString()
    upsertStockProfile(candidate.ticker, {
      name: candidate.name ?? null,
      stockExchange: candidate.exchange ?? null,
      currency: candidate.currency ?? null,
      resolvedSource: candidate.source ?? 'manual',
      resolvedAt: now,
      confirmed: true,
      confirmedAt: now,
    })
    setAddInput('')
    setResolving(null)
    refresh()
  }

  // ── Archive / unarchive ───────────────────────────────────────────────────────

  function handleArchive(ticker) {
    archiveStockProfile(ticker)
    deleteWatchlistEntriesForTicker(ticker)
    refresh()
  }

  function handleUnarchive(ticker) {
    unarchiveStockProfile(ticker)
    refresh()
  }

  // ── Permanent delete ──────────────────────────────────────────────────────────

  function handleDelete(ticker) {
    if (deleteInput.trim().toUpperCase() !== ticker.toUpperCase()) return
    deleteStockProfile(ticker)
    deleteApiDividendHistoryForTicker(ticker)
    deleteManualPricesForTicker(ticker)
    setDeletingTicker(null)
    setDeleteInput('')
    refresh()
  }

  // ── Row helpers ───────────────────────────────────────────────────────────────

  function canDelete(ticker) {
    return (
      !txCounts[ticker] &&
      !divCounts[ticker] &&
      !portfolioCounts[ticker] &&
      !watchlistCounts[ticker]
    )
  }

  function deleteBlockReason(ticker) {
    const parts = []
    if (txCounts[ticker]) parts.push(`${txCounts[ticker]} transaction${txCounts[ticker] > 1 ? 's' : ''}`)
    if (divCounts[ticker]) parts.push(`${divCounts[ticker]} dividend${divCounts[ticker] > 1 ? 's' : ''}`)
    if (portfolioCounts[ticker]) parts.push(`${portfolioCounts[ticker]} portfolio assignment${portfolioCounts[ticker] > 1 ? 's' : ''}`)
    if (watchlistCounts[ticker]) parts.push(`${watchlistCounts[ticker]} watchlist ${watchlistCounts[ticker] > 1 ? 'entries' : 'entry'}`)
    return parts.length ? `Remove first: ${parts.join(', ')}` : ''
  }

  function archiveDisabled(ticker) {
    return hasOpenLotsForTicker(ticker)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Stock inventory</h1>
          <div className={styles.filterToggle}>
            <button
              className={`${styles.filterBtn} ${!showArchived ? styles.filterBtnActive : ''}`}
              onClick={() => setShowArchived(false)}
            >Active</button>
            <button
              className={`${styles.filterBtn} ${showArchived ? styles.filterBtnActive : ''}`}
              onClick={() => setShowArchived(true)}
            >Archived</button>
          </div>
          <div className={styles.filterToggle}>
            <button
              className={`${styles.filterBtn} ${confirmFilter === 'all' ? styles.filterBtnActive : ''}`}
              onClick={() => handleConfirmFilter('all')}
            >All</button>
            <button
              className={`${styles.filterBtn} ${confirmFilter === 'confirmed' ? styles.filterBtnActive : ''}`}
              onClick={() => handleConfirmFilter('confirmed')}
            >Confirmed</button>
            <button
              className={`${styles.filterBtn} ${confirmFilter === 'unconfirmed' ? styles.filterBtnActive : ''}`}
              onClick={() => handleConfirmFilter('unconfirmed')}
            >Unconfirmed</button>
          </div>
        </div>
        <div className={styles.addRow}>
          <input
            className={styles.addInput}
            value={addInput}
            onChange={e => setAddInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            placeholder="Ticker (AAPL) or company name…"
          />
          <button className={styles.addBtn} onClick={handleAdd} disabled={!addInput.trim()}>
            + Add stock
          </button>
          <button
            className={styles.addBtn}
            onClick={() => setManualAddOpen(true)}
            title="Add an asset with no API data — you enter the prices"
          >
            + Manual stock
          </button>
        </div>
        {addError && <p className={styles.addError}>{addError}</p>}
      </div>

      {sorted.length === 0 ? (
        <p className={styles.empty}>{emptyMessage(showArchived, confirmFilter, profiles.length)}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} onClick={() => handleSort('ticker')}>Ticker {sortIcon('ticker')}</th>
                <th className={styles.th} onClick={() => handleSort('name')}>Name {sortIcon('name')}</th>
                <th className={styles.th} onClick={() => handleSort('stockExchange')}>Exchange {sortIcon('stockExchange')}</th>
                <th className={styles.th} onClick={() => handleSort('currency')}>Currency {sortIcon('currency')}</th>
                <th className={styles.th} onClick={() => handleSort('price')}>Price {sortIcon('price')}</th>
                <th className={styles.th} onClick={() => handleSort('confirmed')}>Confirmed {sortIcon('confirmed')}</th>
                <th className={styles.th} onClick={() => handleSort('hqCountry')}>HQ country {sortIcon('hqCountry')}</th>
                <th className={styles.th} onClick={() => handleSort('dividendFrequency')}>Div freq {sortIcon('dividendFrequency')}</th>
                {showArchived && <th className={styles.th} onClick={() => handleSort('archivedAt')}>Archived {sortIcon('archivedAt')}</th>}
                <th className={styles.th}>Transactions</th>
                <th className={styles.th}>Dividends</th>
                <th className={styles.th}>Portfolios</th>
                <th className={styles.th}>Watchlists</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => {
                const hasTx   = !!txCounts[p.ticker]
                const hasDiv  = !!divCounts[p.ticker]
                const hasPort = !!portfolioCounts[p.ticker]
                const hasWatch= !!watchlistCounts[p.ticker]
                const openLots = archiveDisabled(p.ticker)
                const deletable = canDelete(p.ticker)

                return (
                  <tr key={p.ticker} className={styles.row}>
                    <td className={styles.tdTicker}>
                      <button
                        className={styles.tickerBtn}
                        onClick={() => onNavigate?.('stock', { ticker: p.ticker })}
                        title="Open stock page"
                      >
                        {p.ticker}
                      </button>
                    </td>
                    <td className={styles.td}>{p.name ?? <span className={styles.missing}>—</span>}</td>
                    <td className={styles.td}>{p.stockExchange ?? <span className={styles.missing}>—</span>}</td>
                    <td className={styles.td}>{p.currency ?? <span className={styles.missing}>—</span>}</td>
                    <td className={styles.td}>{renderPrice(prices[p.ticker])}</td>
                    <td className={styles.td}>
                      <button
                        className={styles.confirmedBtn}
                        onClick={() => handleToggleConfirmed(p.ticker, p.confirmed === true)}
                        title={p.confirmed === true ? 'Confirmed — click to mark as needing review' : 'Needs review — click to mark as confirmed'}
                        aria-label={p.confirmed === true ? `Mark ${p.ticker} as needing review` : `Mark ${p.ticker} as confirmed`}
                      >
                        <span className={p.confirmed === true ? styles.confirmedYes : styles.confirmedNo}>
                          {p.confirmed === true ? '✓ Confirmed' : '○ Needs review'}
                        </span>
                      </button>
                    </td>
                    <td className={styles.td}>{getEffectiveHqCountry(p) ?? <span className={styles.missing}>—</span>}</td>
                    <td className={styles.td}><span className={styles.freq}>{p.dividendFrequency ?? 'unknown'}</span></td>
                    {showArchived && (
                      <td className={styles.td} title={p.archivedAt ? new Date(p.archivedAt).toLocaleString() : ''}>
                        <span className={styles.archivedBadge}>Archived</span>
                      </td>
                    )}

                    {/* History counts — clickable deep links */}
                    <td className={styles.tdCount}>
                      {hasTx ? (
                        <button className={styles.countLink} onClick={() => onNavigate?.('transactions', { ticker: p.ticker })} title="View transactions">
                          {txCounts[p.ticker]}
                        </button>
                      ) : <span className={styles.countZero}>0</span>}
                    </td>
                    <td className={styles.tdCount}>
                      {hasDiv ? (
                        <button className={styles.countLink} onClick={() => onNavigate?.('transactions', { ticker: p.ticker })} title="View dividends">
                          {divCounts[p.ticker]}
                        </button>
                      ) : <span className={styles.countZero}>0</span>}
                    </td>
                    <td className={styles.tdCount}>
                      {hasPort ? (
                        <button className={styles.countLink} onClick={() => onNavigate?.('portfolios')} title="View portfolio assignments">
                          {portfolioCounts[p.ticker]}
                        </button>
                      ) : <span className={styles.countZero}>0</span>}
                    </td>
                    <td className={styles.tdCount}>
                      {hasWatch ? (
                        <button className={styles.countLink} onClick={() => onNavigate?.('watchlists')} title="View watchlist entries">
                          {watchlistCounts[p.ticker]}
                        </button>
                      ) : <span className={styles.countZero}>0</span>}
                    </td>

                    {/* Actions */}
                    <td className={styles.tdActions}>
                      <button
                        className={styles.actionBtn}
                        onClick={() => setEditingTicker(p.ticker)}
                        title="Edit profile"
                        aria-label={`Edit profile for ${p.ticker}`}
                      >✎</button>

                      {showArchived ? (
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleUnarchive(p.ticker)}
                          title="Unarchive"
                          aria-label={`Unarchive ${p.ticker}`}
                        >↩</button>
                      ) : (
                        <button
                          className={`${styles.actionBtn} ${openLots ? styles.actionBtnDisabled : ''}`}
                          onClick={() => !openLots && handleArchive(p.ticker)}
                          title={openLots ? 'Sell all positions in this stock before archiving' : 'Archive'}
                          aria-label={`Archive ${p.ticker}`}
                          disabled={openLots}
                        >⊘</button>
                      )}

                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnDanger} ${!deletable ? styles.actionBtnDisabled : ''}`}
                        onClick={() => { if (deletable) { setDeletingTicker(p.ticker); setDeleteInput('') } }}
                        title={deletable ? 'Permanently delete' : deleteBlockReason(p.ticker)}
                        aria-label={`Delete ${p.ticker}`}
                        disabled={!deletable}
                      >🗑</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add manual stock dialog ────────────────────────────────────────── */}
      {manualAddOpen && (
        <AddManualStockDialog
          onConfirm={fields => {
            createManualStockProfile(fields)
            setManualAddOpen(false)
            refresh()
          }}
          onCancel={() => setManualAddOpen(false)}
        />
      )}

      {/* ── Resolution dialog ──────────────────────────────────────────────── */}
      {resolving && (
        <StockProfileResolutionDialog
          ticker={resolving.ticker}
          direction={resolving.direction}
          onConfirm={handleResolved}
          onCancel={() => setResolving(null)}
        />
      )}

      {/* ── Edit profile dialog ───────────────────────────────────────────── */}
      {editingTicker && (
        <EditProfileDialog
          ticker={editingTicker}
          profile={profiles.find(p => p.ticker === editingTicker) ?? null}
          onSave={fields => {
            upsertStockProfile(editingTicker, { ...fields, confirmed: true, confirmedAt: new Date().toISOString() })
            setEditingTicker(null)
            refresh()
          }}
          onCancel={() => setEditingTicker(null)}
        />
      )}

      {/* ── Permanent delete confirmation ─────────────────────────────────── */}
      {deletingTicker && (
        <div className={styles.deleteBackdrop} onClick={e => { if (e.target === e.currentTarget) setDeletingTicker(null) }}>
          <div className={styles.deleteBox}>
            <h2 className={styles.deleteTitle}>Delete {deletingTicker}?</h2>
            <p className={styles.deleteNote}>
              This permanently removes the stock profile and any cached dividend history.
              This cannot be undone. Type <strong>{deletingTicker}</strong> to confirm.
            </p>
            <input
              className={styles.deleteInput}
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              placeholder={deletingTicker}
              autoFocus
            />
            <div className={styles.deleteActions}>
              <button className={styles.deleteCancelBtn} onClick={() => setDeletingTicker(null)}>Cancel</button>
              <button
                className={styles.deleteConfirmBtn}
                onClick={() => handleDelete(deletingTicker)}
                disabled={deleteInput.trim().toUpperCase() !== deletingTicker}
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function renderPrice(state) {
  if (state === undefined || state === 'loading') return <span className={styles.missing}>…</span>
  if (state === null) return <span className={styles.missing}>—</span>
  return (
    <span>
      {fmtAmt(state.price)} {state.currency ?? ''}
      {state.isStale && (
        <span
          className={styles.staleIcon}
          title={`Last known price from ${state.fetchedAt ? new Date(state.fetchedAt).toLocaleString() : 'unknown time'} — live data unavailable`}
        >⏱</span>
      )}
    </span>
  )
}

function emptyMessage(showArchived, confirmFilter, totalLoaded) {
  if (totalLoaded === 0) return showArchived ? 'No archived stocks.' : 'No stocks yet. Add one above.'
  if (confirmFilter === 'confirmed')   return 'No confirmed stocks. Visit a stock\'s profile and confirm the mapping to add it here.'
  if (confirmFilter === 'unconfirmed') return 'All stocks are confirmed — nothing to review.'
  return showArchived ? 'No archived stocks.' : 'No stocks yet. Add one above.'
}
