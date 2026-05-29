import { useState, useEffect, useRef } from 'react'
import { searchSymbols } from '../data/marketDataClient'
import styles from './ExchangeSelector.module.css'

// Small dropdown next to a stock's exchange label that lets the user switch
// the profile's `stockExchange` + `currency` to a different listing of the
// same ticker. Lazy-loads candidates via SPEC-027 searchSymbols on first open.
//
// Props:
//   ticker            — bare ticker (uppercase)
//   currentExchange   — MIC currently on the profile (may be null)
//   currentCurrency   — currency currently on the profile (display only)
//   onChange(exchange, currency)
export default function ExchangeSelector({ ticker, currentExchange, currentCurrency, onChange }) {
  const [open,       setOpen]       = useState(false)
  const [candidates, setCandidates] = useState(null)  // null = not yet fetched
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const rootRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function handleToggle() {
    const next = !open
    setOpen(next)
    // Lazy-fetch on first open — no need for an effect since this is event-driven.
    if (next && candidates === null && !loading) {
      setLoading(true)
      setError(null)
      searchSymbols(ticker)
        .then(results => setCandidates(results.filter(c => c.ticker === ticker)))
        .catch(err => setError(err.message ?? 'Search failed'))
        .finally(() => setLoading(false))
    }
  }

  function handlePick(c) {
    setOpen(false)
    if (c.exchange === currentExchange && c.currency === currentCurrency) return
    onChange(c.exchange, c.currency)
  }

  const label = currentExchange
    ? (currentCurrency ? `${currentExchange} · ${currentCurrency}` : currentExchange)
    : 'Set exchange'

  // Move the current listing to the top, hide exact duplicates of it from the list.
  const others = (candidates ?? []).filter(c =>
    !(c.exchange === currentExchange && c.currency === currentCurrency))

  return (
    <span ref={rootRef} className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        onClick={handleToggle}
        title="Switch exchange / listing"
      >
        {label}
        <span className={styles.caret}>▾</span>
      </button>
      {open && (
        <div className={styles.popover}>
          {currentExchange && (
            <div className={styles.currentRow}>
              <span className={styles.currentLabel}>Current</span>
              <span className={styles.exchange}>{currentExchange}</span>
              {currentCurrency && <span className={styles.currency}>{currentCurrency}</span>}
            </div>
          )}
          {loading && <div className={styles.note}>Loading…</div>}
          {error && <div className={styles.error}>{error}</div>}
          {!loading && !error && candidates !== null && others.length === 0 && (
            <div className={styles.note}>No other listings found.</div>
          )}
          {others.map((c, i) => (
            <button
              key={`${c.exchange}|${c.currency}|${i}`}
              type="button"
              className={styles.row}
              onClick={() => handlePick(c)}
            >
              <span className={styles.exchange}>{c.exchange ?? '—'}</span>
              {c.currency && <span className={styles.currency}>{c.currency}</span>}
              {c.name && <span className={styles.name}>{c.name}</span>}
              {c.source && <span className={styles.source}>{c.source}</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
