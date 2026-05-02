import { useState, useEffect, useRef } from 'react'
import { searchSymbols, getLatestPrice } from '../data/marketDataClient'
import { fmtAmt } from '../utils/format'
import styles from './TickerRenameDialog.module.css'

// Handles the full rename flow:
//   step 'input'   — user types the new ticker and clicks Look up
//   step 'confirm' — single or zero candidates; shows a summary card
//   step 'pick'    — multiple exact-match candidates; user selects one
//
// onConfirm(newTicker, resolvedFields) — called with the bare new ticker and
//   any resolved profile fields (name, stockExchange, currency, …).
//   The caller is responsible for calling renameTicker() and navigating away.

export default function TickerRenameDialog({ oldTicker, onConfirm, onCancel }) {
  const [step,         setStep]         = useState('input')
  const [input,        setInput]        = useState('')
  const [looking,      setLooking]      = useState(false)
  const [lookError,    setLookError]    = useState(null)
  const [candidates,   setCandidates]   = useState([])   // exact-match results from searchSymbols
  const [selectedIdx,  setSelectedIdx]  = useState(0)    // picker selection

  // Price for the confirm card (single/zero candidate path)
  const [confirmPrice, setConfirmPrice] = useState(null) // null | 'loading' | { price, currency }

  // Prices per candidate in the picker
  const [pickerPrices, setPickerPrices] = useState({})   // { [ticker|exchange]: { price, currency } | null }
  const fetchedKeys = useRef(new Set())

  const newTicker = input.trim().toUpperCase()

  async function handleLookup() {
    if (!newTicker) return
    setLooking(true)
    setLookError(null)
    try {
      const results = await searchSymbols(newTicker)
      const exact = results.filter(c => (c.ticker ?? '').toUpperCase() === newTicker)
      setCandidates(exact)

      if (exact.length === 1) {
        setStep('confirm')
        setConfirmPrice('loading')
        getLatestPrice(exact[0].ticker, exact[0].exchange ?? null)
          .then(r => setConfirmPrice({ price: r.price, currency: r.currency }))
          .catch(() => setConfirmPrice(null))
      } else if (exact.length > 1) {
        setSelectedIdx(0)
        setStep('pick')
      } else {
        // Zero candidates
        setStep('confirm')
        setConfirmPrice('loading')
        getLatestPrice(newTicker, null)
          .then(r => setConfirmPrice({ price: r.price, currency: r.currency }))
          .catch(() => setConfirmPrice(null))
      }
    } catch {
      setLookError('Lookup failed — check your connection and try again.')
    } finally {
      setLooking(false)
    }
  }

  // Fetch prices per candidate when picker becomes active
  useEffect(() => {
    if (step !== 'pick') return
    candidates.forEach(c => {
      const k = `${c.ticker}|${c.exchange ?? ''}`
      if (fetchedKeys.current.has(k)) return
      fetchedKeys.current.add(k)
      getLatestPrice(c.ticker, c.exchange ?? null)
        .then(r => setPickerPrices(prev => ({ ...prev, [k]: { price: r.price, currency: r.currency } })))
        .catch(() => setPickerPrices(prev => ({ ...prev, [k]: null })))
    })
  }, [step, candidates])

  function handleBack() {
    setStep('input')
    setConfirmPrice(null)
    setPickerPrices({})
    fetchedKeys.current.clear()
  }

  function handleRename() {
    if (step === 'confirm') {
      const c = candidates[0]
      onConfirm(newTicker, c ? {
        name:           c.name ?? null,
        stockExchange:  c.exchange ?? null,
        currency:       c.currency ?? null,
        resolvedSource: 'market',
        resolvedAt:     new Date().toISOString(),
      } : {})
    } else {
      const c = candidates[selectedIdx]
      onConfirm(newTicker, {
        name:           c.name ?? null,
        stockExchange:  c.exchange ?? null,
        currency:       c.currency ?? null,
        resolvedSource: 'market',
        resolvedAt:     new Date().toISOString(),
      })
    }
  }

  const singleCandidate = candidates[0] // may be undefined when zero results

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.dialog}>

        {/* ── Step: input ──────────────────────────────────────────── */}
        {step === 'input' && (<>
          <h2 className={styles.title}>Rename ticker</h2>
          <div className={styles.currentRow}>
            <span className={styles.currentLabel}>Current ticker</span>
            <span className={styles.currentValue}>{oldTicker}</span>
          </div>
          <div className={styles.inputRow}>
            <span className={styles.currentLabel}>New ticker</span>
            <input
              className={styles.tickerInput}
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && !looking && newTicker && handleLookup()}
              placeholder="e.g. SGRO"
              autoFocus
              disabled={looking}
            />
            <button
              className={styles.lookupBtn}
              onClick={handleLookup}
              disabled={!newTicker || looking}
            >
              {looking ? 'Looking up…' : 'Look up'}
            </button>
          </div>
          {lookError && <p className={styles.errorMsg}>{lookError}</p>}
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          </div>
        </>)}

        {/* ── Step: confirm (single or zero candidates) ────────────── */}
        {step === 'confirm' && (<>
          <h2 className={styles.title}>Rename {oldTicker} → {newTicker}?</h2>
          <div className={styles.summaryCard}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Company</span>
              <span className={styles.summaryValue}>{singleCandidate?.name ?? '—'}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Exchange</span>
              <span className={styles.summaryValue}>{singleCandidate?.exchange ?? '—'}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Currency</span>
              <span className={styles.summaryValue}>{singleCandidate?.currency ?? '—'}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Price</span>
              <span className={styles.summaryValue}>
                {confirmPrice === 'loading' ? '…'
                  : confirmPrice === null ? '—'
                  : `${fmtAmt(confirmPrice.price)} ${confirmPrice.currency ?? ''}`}
              </span>
            </div>
          </div>
          <p className={styles.warning}>
            All historical transactions, dividends, and watchlist entries will be updated.
            This cannot be undone.
          </p>
          <div className={styles.actions}>
            <button className={styles.backBtn} onClick={handleBack}>Back</button>
            <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
            <button className={styles.renameBtn} onClick={handleRename}>Rename</button>
          </div>
        </>)}

        {/* ── Step: pick (multiple candidates) ─────────────────────── */}
        {step === 'pick' && (<>
          <h2 className={styles.title}>Rename {oldTicker} → {newTicker}</h2>
          <p className={styles.pickHint}>Select the correct listing:</p>
          <div className={styles.candidateList}>
            {candidates.map((c, i) => {
              const k = `${c.ticker}|${c.exchange ?? ''}`
              const p = pickerPrices[k]
              return (
                <label
                  key={i}
                  className={`${styles.candidateRow} ${selectedIdx === i ? styles.candidateSelected : ''}`}
                >
                  <input
                    type="radio"
                    name="renameCandidate"
                    checked={selectedIdx === i}
                    onChange={() => setSelectedIdx(i)}
                    className={styles.radio}
                  />
                  <span className={styles.source}>from {c.source}</span>
                  <span className={styles.candidateName}>{c.name ?? '—'}</span>
                  <span className={styles.candidateMeta}>{c.exchange ?? '—'}</span>
                  <span className={styles.candidateMeta}>{c.currency ?? '—'}</span>
                  <span className={styles.candidatePrice}>
                    {p === undefined ? '…' : p === null ? '—' : `${fmtAmt(p.price)} ${p.currency ?? ''}`}
                  </span>
                </label>
              )
            })}
          </div>
          <p className={styles.warning}>
            All historical transactions, dividends, and watchlist entries will be updated.
            This cannot be undone.
          </p>
          <div className={styles.actions}>
            <button className={styles.backBtn} onClick={handleBack}>Back</button>
            <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
            <button className={styles.renameBtn} onClick={handleRename}>Rename</button>
          </div>
        </>)}

      </div>
    </div>
  )
}
