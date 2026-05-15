import { useState, useEffect } from 'react'
import {
  getActiveStockProfiles, getArchivedStockProfiles, upsertStockProfile,
  archiveStockProfile, unarchiveStockProfile, deleteStockProfile,
} from '../data/stockProfiles'
import { getStockTransactionsByTicker, hasOpenLotsForTicker } from '../data/stockTransactions'
import { getDividendsByTicker } from '../data/dividends'
import { getAllPortfolioAssignments } from '../data/portfolios'
import { getAllWatchlistEntries, deleteWatchlistEntriesForTicker } from '../data/watchlists'
import { deleteApiDividendHistoryForTicker } from '../data/apiDividendHistory'
import EditProfileDialog from '../components/EditProfileDialog'
import StockProfileResolutionDialog from '../components/StockProfileResolutionDialog'
import styles from './StockInventory.module.css'

const SORT_KEY = 'rmoney_stock_inventory_sort'

function loadSort() {
  try { return JSON.parse(localStorage.getItem(SORT_KEY)) ?? { key: 'ticker', dir: 'asc' } } catch { return { key: 'ticker', dir: 'asc' } }
}
function saveSort(s) { localStorage.setItem(SORT_KEY, JSON.stringify(s)) }

function detectDirection(input) {
  return /^[A-Z0-9.]{1,8}$/.test(input.trim().toUpperCase()) ? 'A' : 'B'
}

export default function StockInventory({ onNavigate }) {
  const [showArchived, setShowArchived] = useState(false)
  const [sort, setSort] = useState(loadSort)
  const [profiles, setProfiles] = useState([])
  const [txCounts, setTxCounts] = useState({})
  const [divCounts, setDivCounts] = useState({})
  const [portfolioCounts, setPortfolioCounts] = useState({})
  const [watchlistCounts, setWatchlistCounts] = useState({})
  const [editingTicker, setEditingTicker] = useState(null)
  const [deletingTicker, setDeletingTicker] = useState(null)
  const [deleteInput, setDeleteInput] = useState('')
  const [addInput, setAddInput] = useState('')
  const [addError, setAddError] = useState('')
  const [resolving, setResolving] = useState(null) // { ticker, direction }

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
  }

  useEffect(() => { refresh() }, [showArchived])  // eslint-disable-line react-hooks/exhaustive-deps

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

  const sorted = [...profiles].sort((a, b) => {
    const mul = sort.dir === 'asc' ? 1 : -1
    const av = a[sort.key] ?? ''
    const bv = b[sort.key] ?? ''
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
    upsertStockProfile(candidate.ticker, {
      name: candidate.name ?? null,
      stockExchange: candidate.exchange ?? null,
      currency: candidate.currency ?? null,
      resolvedSource: candidate.source ?? 'manual',
      resolvedAt: new Date().toISOString(),
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
        </div>
        {addError && <p className={styles.addError}>{addError}</p>}
      </div>

      {sorted.length === 0 ? (
        <p className={styles.empty}>
          {showArchived ? 'No archived stocks.' : 'No stocks yet. Add one above.'}
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} onClick={() => handleSort('ticker')}>Ticker {sortIcon('ticker')}</th>
                <th className={styles.th} onClick={() => handleSort('name')}>Name {sortIcon('name')}</th>
                <th className={styles.th} onClick={() => handleSort('stockExchange')}>Exchange {sortIcon('stockExchange')}</th>
                <th className={styles.th} onClick={() => handleSort('currency')}>Currency {sortIcon('currency')}</th>
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
                    <td className={styles.td}>{p.hqCountry ?? <span className={styles.missing}>—</span>}</td>
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
            upsertStockProfile(editingTicker, fields)
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
