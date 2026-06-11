import { useState } from 'react'
import {
  getWatchlistEntries, addStockToWatchlist, deleteWatchlistEntry,
  getAlertsForEntry, createAlert, deleteAlert, rearmAlert,
  updateWatchlist, deleteWatchlist, getWatchlists,
} from '../data/watchlists'
import { createWatchlist } from '../data/watchlists'
import { getStockProfile } from '../data/stockProfiles'
import StockProfileResolutionDialog from '../components/StockProfileResolutionDialog'
import AmountInput from '../components/AmountInput'
import { parseAmount } from '../utils/format'
import styles from './WatchlistDetail.module.css'

function loadAlertsMap(entries) {
  return Object.fromEntries(entries.map(e => [e.id, getAlertsForEntry(e.id)]))
}

function detectDirection(input) {
  return /^[A-Z0-9.]{1,8}$/.test(input.trim().toUpperCase()) ? 'A' : 'B'
}

export default function WatchlistDetail({ watchlist, onBack, onNavigate }) {
  const [listName,  setListName]  = useState(watchlist.name)
  const [entries,   setEntries]   = useState(() => getWatchlistEntries(watchlist.id))
  const [alertsMap, setAlertsMap] = useState(() => loadAlertsMap(getWatchlistEntries(watchlist.id)))

  const [addInput,  setAddInput]  = useState('')
  const [addError,  setAddError]  = useState('')
  const [resolving, setResolving] = useState(null)  // { ticker, direction }

  const [removingId,     setRemovingId]     = useState(null)
  const [alertFormId,    setAlertFormId]    = useState(null)  // entry id
  const [alertDir,       setAlertDir]       = useState('above')
  const [alertThreshold, setAlertThreshold] = useState('')
  const [alertCurrency,  setAlertCurrency]  = useState('')

  const [renamingList, setRenamingList] = useState(false)
  const [renameVal,    setRenameVal]    = useState(watchlist.name)
  const [deletingList, setDeletingList] = useState(false)

  function refresh() {
    const e = getWatchlistEntries(watchlist.id)
    setEntries(e)
    setAlertsMap(loadAlertsMap(e))
  }

  // ── Add stock ────────────────────────────────────────────────────────────────

  function handleAdd() {
    const val = addInput.trim()
    if (!val) return
    const direction = detectDirection(val)
    const query = direction === 'A' ? val.toUpperCase() : val
    setResolving({ ticker: query, direction })
    setAddError('')
  }

  function handleResolved(candidate) {
    try {
      addStockToWatchlist(watchlist.id, candidate.ticker)
      setAddInput('')
      setResolving(null)
      refresh()
    } catch (e) {
      setAddError(e.message)
      setResolving(null)
    }
  }

  // ── Remove entry ─────────────────────────────────────────────────────────────

  function handleRemoveEntry(entryId) {
    deleteWatchlistEntry(entryId)
    setRemovingId(null)
    refresh()
  }

  // ── Alert form ───────────────────────────────────────────────────────────────

  function openAlertForm(entry) {
    const profile = getStockProfile(entry.ticker)
    setAlertFormId(entry.id)
    setAlertDir('above')
    setAlertThreshold('')
    setAlertCurrency(profile?.currency ?? '')
  }

  function handleSaveAlert() {
    const t = parseAmount(alertThreshold)
    if (!t || t <= 0) return
    createAlert(alertFormId, { direction: alertDir, threshold: t, currency: alertCurrency })
    setAlertFormId(null)
    refresh()
  }

  // ── Watchlist rename/delete ──────────────────────────────────────────────────

  function handleSaveRename() {
    if (!renameVal.trim()) return
    updateWatchlist(watchlist.id, { name: renameVal.trim() })
    setListName(renameVal.trim())
    setRenamingList(false)
  }

  function handleDeleteList() {
    deleteWatchlist(watchlist.id)
    if (getWatchlists().length === 0) createWatchlist('My watchlist')
    onBack()
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function alertSummary(entryId) {
    const alerts = alertsMap[entryId] ?? []
    if (alerts.length === 0) return 'no alerts'
    return alerts
      .map(a => `${a.direction === 'above' ? '≥' : '≤'} ${a.currency ? a.currency + ' ' : ''}${a.threshold}`)
      .join(', ')
  }

  const allAlertsFlat = Object.values(alertsMap).flat()
  const triggeredAlerts = allAlertsFlat.filter(a => a.status === 'triggered')

  return (
    <div className={styles.screen}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>‹</button>

        {renamingList ? (
          <div className={styles.renameRow}>
            <input
              className={styles.renameInput}
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveRename(); if (e.key === 'Escape') setRenamingList(false) }}
              autoFocus
            />
            <button className={styles.saveBtn} onClick={handleSaveRename} disabled={!renameVal.trim()}>Save</button>
            <button className={styles.cancelBtn} onClick={() => setRenamingList(false)}>Cancel</button>
          </div>
        ) : (
          <>
            <h1 className={styles.title}>{listName}</h1>
            <div className={styles.headerActions}>
              {!deletingList && (
                <>
                  <button className={styles.actionBtn} onClick={() => setRenamingList(true)}>Rename</button>
                  <button className={styles.actionBtnDanger} onClick={() => setDeletingList(true)}>Delete</button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Delete watchlist confirmation ───────────────────────────────────── */}
      {deletingList && (
        <div className={styles.deleteConfirmBar}>
          <span className={styles.deleteMsg}>Delete "{listName}" and all its stocks and alerts?</span>
          <button className={styles.cancelBtn} onClick={() => setDeletingList(false)}>Cancel</button>
          <button className={styles.deleteBtn} onClick={handleDeleteList}>Delete</button>
        </div>
      )}

      {/* ── Triggered alert banners ─────────────────────────────────────────── */}
      {triggeredAlerts.length > 0 && (
        <div className={styles.banners}>
          {triggeredAlerts.map(a => {
            const entry = entries.find(e => e.id === a.watchlistEntryId)
            const ticker = entry?.ticker ?? '—'
            return (
              <div key={a.id} className={styles.banner}>
                <span className={styles.bannerLabel}>ALERT</span>
                <span className={styles.bannerText}>
                  {ticker} {a.direction === 'above' ? '≥' : '≤'} {a.currency ? a.currency + ' ' : ''}{a.threshold}
                </span>
                <button className={styles.rearmBtn} onClick={() => { rearmAlert(a.id); refresh() }}>Rearm</button>
                <button className={styles.dismissBtn} onClick={() => { deleteAlert(a.id); refresh() }}>Dismiss</button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add stock ──────────────────────────────────────────────────────── */}
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

      {/* ── Resolution dialog ───────────────────────────────────────────────── */}
      {resolving && (
        <StockProfileResolutionDialog
          ticker={resolving.ticker}
          direction={resolving.direction}
          onConfirm={handleResolved}
          onCancel={() => setResolving(null)}
        />
      )}

      {/* ── Stock entries ───────────────────────────────────────────────────── */}
      <div className={styles.entryList}>
        {entries.length === 0 ? (
          <p className={styles.empty}>No stocks yet. Add one above.</p>
        ) : (
          entries.map(entry => {
            const profile = getStockProfile(entry.ticker)
            const entryAlerts = alertsMap[entry.id] ?? []
            const hasTriggered = entryAlerts.some(a => a.status === 'triggered')

            return (
              <div key={entry.id} className={`${styles.entryCard} ${hasTriggered ? styles.entryTriggered : ''}`}>
                <div className={styles.entryMain}>
                  {/* Ticker + name → navigate to stock page */}
                  <button
                    className={styles.tickerBtn}
                    onClick={() => onNavigate?.('stock', { ticker: entry.ticker })}
                  >
                    <span className={styles.ticker}>{entry.ticker}</span>
                    {profile?.name && <span className={styles.stockName}>{profile.name}</span>}
                  </button>

                  {profile?.stockExchange && (
                    <span className={styles.exchange}>{profile.stockExchange}</span>
                  )}

                  {/* Price: always "—" until SPEC-027 price cache available */}
                  <span className={styles.price}>—</span>

                  {/* Alert summary */}
                  <span className={styles.alertSummary}>{alertSummary(entry.id)}</span>

                  {/* Actions */}
                  <div className={styles.entryActions}>
                    <button
                      className={styles.alertAddBtn}
                      onClick={() => { setAlertFormId(alertFormId === entry.id ? null : null); openAlertForm(entry) }}
                    >
                      + Alert
                    </button>
                    {removingId !== entry.id ? (
                      <button
                        className={styles.removeBtn}
                        onClick={() => {
                          if (entryAlerts.length > 0) setRemovingId(entry.id)
                          else handleRemoveEntry(entry.id)
                        }}
                      >
                        ✕
                      </button>
                    ) : (
                      <>
                        <button className={styles.cancelBtn} onClick={() => setRemovingId(null)}>Keep</button>
                        <button className={styles.deleteBtn} onClick={() => handleRemoveEntry(entry.id)}>Remove</button>
                      </>
                    )}
                  </div>
                </div>

                {/* ── Alert list for this entry ────────────────────────────── */}
                {entryAlerts.length > 0 && (
                  <div className={styles.alertList}>
                    {entryAlerts.map(a => (
                      <div key={a.id} className={`${styles.alertRow} ${a.status === 'triggered' ? styles.alertRowTriggered : ''}`}>
                        <span className={styles.alertPip} data-status={a.status} />
                        <span className={styles.alertLabel}>
                          {a.direction === 'above' ? '≥' : '≤'} {a.currency ? a.currency + ' ' : ''}{a.threshold}
                        </span>
                        <span className={styles.alertStatus}>{a.status}</span>
                        {a.status === 'triggered' && (
                          <button className={styles.rearmBtn} onClick={() => { rearmAlert(a.id); refresh() }}>Rearm</button>
                        )}
                        <button className={styles.alertDeleteBtn} onClick={() => { deleteAlert(a.id); refresh() }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Alert add form for this entry ────────────────────────── */}
                {alertFormId === entry.id && (
                  <div className={styles.alertForm}>
                    <span className={styles.alertFormTitle}>New alert for {entry.ticker}</span>
                    <div className={styles.alertFormRow}>
                      <label className={styles.alertFormLabel}>
                        <input type="radio" name={`dir-${entry.id}`} value="above" checked={alertDir === 'above'} onChange={() => setAlertDir('above')} />
                        {' '}above ≥
                      </label>
                      <label className={styles.alertFormLabel}>
                        <input type="radio" name={`dir-${entry.id}`} value="below" checked={alertDir === 'below'} onChange={() => setAlertDir('below')} />
                        {' '}below ≤
                      </label>
                      <AmountInput
                        className={styles.thresholdInput}
                        value={alertThreshold}
                        onChange={v => setAlertThreshold(v)}
                        placeholder="0,00"
                      />
                      {alertCurrency && <span className={styles.alertCurrency}>{alertCurrency}</span>}
                    </div>
                    <div className={styles.alertFormActions}>
                      <button className={styles.cancelBtn} onClick={() => setAlertFormId(null)}>Cancel</button>
                      <button
                        className={styles.saveBtn}
                        onClick={handleSaveAlert}
                        disabled={!alertThreshold || parseAmount(alertThreshold) <= 0}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
