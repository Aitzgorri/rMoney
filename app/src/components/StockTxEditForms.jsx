// Shared buy/sell edit forms (SPEC-019). Extracted from InvestingAccountDetail so they can
// be opened from any screen (account detail, stock page, …). These are *presentational* — the
// caller's `onSave(params)` does the actual `updateBuy` / `updateSell` (see `applyBuyEdit` /
// `applySellEdit` in data/stockTxEdit.js), where the cost-basis cascade already lives.
//
// CSS note: these reuse the form/lot styles defined in InvestingAccountDetail.module.css. That
// module is the current home of the shared form styles; relocating them to a neutral shared CSS
// is a future cleanup that doesn't change this component's API.
import { useState } from 'react'
import { fmtAmt, parseAmount } from '../utils/format'
import AmountInput from './AmountInput'
import { getOpenLots, computeFifoAllocations } from '../data/stockTransactions'
import styles from '../screens/InvestingAccountDetail.module.css'

// Formats a share count: removes trailing zeros after decimal.
function trimDecimals(n) {
  return parseFloat(Number(n).toFixed(8)).toString()
}

export function BuyEditForm({ txn, onSave, onCancel }) {
  const [date,          setDate]          = useState(txn.date)
  const [stockExchange, setStockExchange] = useState(txn.stockExchange ?? '')
  const [shares,        setShares]        = useState(String(txn.shares))
  const [price,         setPrice]         = useState(String(txn.price))
  const [fee,           setFee]           = useState(String(txn.fee ?? 0))
  const [extId,         setExtId]         = useState(txn.transactionExternalId ?? '')
  const [saveError,     setSaveError]     = useState(null)

  const feeMismatch = txn.feeCurrency && txn.feeCurrency !== txn.currency
  const total  = Number(shares || 0) * Number(price || 0) + parseAmount(fee) || 0
  const canSave = Number(shares) > 0 && parseAmount(price) > 0 && !feeMismatch

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    setSaveError(null)
    try {
      onSave({ date, stockExchange: stockExchange.trim() || null, shares: Number(shares), price: parseAmount(price), fee: parseAmount(fee) || 0, transactionExternalId: extId.trim() || null })
    } catch (err) {
      setSaveError(err.message)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>Edit buy — {txn.ticker}</h3>
      <p className={styles.formSubtitle}>{txn.currency} · ticker and currency cannot be changed here</p>
      {feeMismatch && (
        <p className={styles.formError}>Fee currency ({txn.feeCurrency}) differs from trade currency ({txn.currency}) — this record cannot be edited until the mismatch is corrected.</p>
      )}
      {saveError && <p className={styles.formError}>{saveError}</p>}
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Date</label>
        <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Exchange (optional)</label>
        <input className={styles.formInput} value={stockExchange} onChange={e => setStockExchange(e.target.value)} placeholder="NASDAQ" />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Shares</label>
        <input className={styles.formInput} type="number" min="0.000001" step="any" value={shares} onChange={e => setShares(e.target.value)} autoFocus />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Price per share ({txn.currency})</label>
        <AmountInput className={styles.formInput} value={price} onChange={v => setPrice(v)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Fee ({txn.currency})</label>
        <AmountInput className={styles.formInput} value={fee} onChange={v => setFee(v)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Transaction ID (optional)</label>
        <input className={styles.formInput} value={extId} onChange={e => setExtId(e.target.value)} placeholder="Broker reference" />
      </div>
      {total > 0 && <p className={styles.ratePreview}>Total cost: {fmtAmt(total)} {txn.currency}</p>}
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!canSave}>Save</button>
      </div>
    </form>
  )
}

export function SellEditForm({ txn, accountId = txn.investingAccountId, onSave, onCancel }) {
  const [date,          setDate]          = useState(txn.date)
  const [stockExchange, setStockExchange] = useState(txn.stockExchange ?? '')
  const [shares,        setShares]        = useState(String(txn.shares))
  const [price,         setPrice]         = useState(String(txn.price))
  const [fee,           setFee]           = useState(String(txn.fee ?? 0))
  const [extId,         setExtId]         = useState(txn.transactionExternalId ?? '')
  const [saveError,     setSaveError]     = useState(null)

  const feeMismatch = txn.feeCurrency && txn.feeCurrency !== txn.currency
  const [showLots,      setShowLots]      = useState(false)
  const [lotInputs,     setLotInputs]     = useState(() => {
    const inputs = {}
    for (const alloc of txn.lotAllocations ?? []) inputs[alloc.sourceBuyId] = String(alloc.sharesFromLot)
    return inputs
  })
  // Phase 32c / item 368: lot-edit toggles manual mode (lots → total). Closing +
  // reopening the picker resets to auto-mode (total → lots via FIFO).
  const [manualMode,    setManualMode]    = useState(false)

  // Open lots EXCLUDING the shares being sold (they're currently "consumed" by this sell record).
  // updateSell deletes and recreates the movements, so for UI purposes we show the lots as if this sell didn't exist.
  const openLots = getOpenLots(accountId, txn.ticker)
  // Add back the shares from the existing allocation so the user can redistribute them
  const lotsWithCredit = openLots.map(lot => {
    const existingAlloc = txn.lotAllocations?.find(a => a.sourceBuyId === lot.id)
    return existingAlloc
      ? { ...lot, remainingShares: lot.remainingShares + existingAlloc.sharesFromLot }
      : lot
  })

  function handleSharesChange(value) {
    setShares(value)
    if (showLots && !manualMode && lotsWithCredit.length > 0) {
      const sharesToSell = Number(value || 0)
      const inputs = {}
      if (sharesToSell > 0) {
        const { allocations } = computeFifoAllocations(lotsWithCredit, sharesToSell)
        for (const alloc of allocations) inputs[alloc.sourceBuyId] = String(alloc.sharesFromLot)
      }
      for (const lot of lotsWithCredit) if (!(lot.id in inputs)) inputs[lot.id] = '0'
      setLotInputs(inputs)
    }
  }

  function handleLotChange(lotId, raw) {
    const lot = lotsWithCredit.find(l => l.id === lotId)
    if (!lot) return
    // Phase 32c / item 367: clamp to lot's remaining shares (including the credit-back
    // from the existing allocation, so the user can redistribute up to what's truly available).
    let clamped = raw
    const numVal = Number(raw)
    if (Number.isFinite(numVal) && numVal > lot.remainingShares) {
      clamped = String(lot.remainingShares)
    }
    const nextInputs = { ...lotInputs, [lotId]: clamped }
    setLotInputs(nextInputs)
    setManualMode(true)
    const sum = Object.values(nextInputs).reduce((s, v) => s + Number(v || 0), 0)
    setShares(sum > 0 ? trimDecimals(sum) : '')
  }

  function toggleLots() {
    if (!showLots) {
      const sharesToSell = Number(shares || 0)
      const inputs = {}
      if (sharesToSell > 0 && lotsWithCredit.length > 0) {
        const { allocations } = computeFifoAllocations(lotsWithCredit, sharesToSell)
        for (const alloc of allocations) inputs[alloc.sourceBuyId] = String(alloc.sharesFromLot)
      }
      for (const lot of lotsWithCredit) if (!(lot.id in inputs)) inputs[lot.id] = '0'
      setLotInputs(inputs)
      setManualMode(false)
    }
    setShowLots(v => !v)
  }

  const lotTotal = Object.values(lotInputs).reduce((s, v) => s + Number(v || 0), 0)
  const lotValid = !showLots || Math.abs(lotTotal - Number(shares || 0)) < 0.000001
  const proceeds = Number(shares || 0) * Number(price || 0)
  const canSave  = Number(shares) > 0 && parseAmount(price) > 0 && lotValid && !feeMismatch

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    setSaveError(null)
    try {
      const lotAllocations = showLots
        ? Object.entries(lotInputs).filter(([, v]) => Number(v) > 0).map(([sourceBuyId, v]) => ({ sourceBuyId, sharesFromLot: Number(v) }))
        : null
      onSave({ date, stockExchange: stockExchange.trim() || null, shares: Number(shares), price: parseAmount(price), fee: parseAmount(fee) || 0, transactionExternalId: extId.trim() || null, lotAllocations })
    } catch (err) {
      setSaveError(err.message)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>Edit sell — {txn.ticker}</h3>
      <p className={styles.formSubtitle}>{txn.currency} · ticker and currency cannot be changed here</p>
      {feeMismatch && (
        <p className={styles.formError}>Fee currency ({txn.feeCurrency}) differs from trade currency ({txn.currency}) — this record cannot be edited until the mismatch is corrected.</p>
      )}
      {saveError && <p className={styles.formError}>{saveError}</p>}
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Date</label>
        <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Exchange (optional)</label>
        <input className={styles.formInput} value={stockExchange} onChange={e => setStockExchange(e.target.value)} placeholder="NASDAQ" />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Shares</label>
        <input className={styles.formInput} type="number" min="0.000001" step="any" value={shares} onChange={e => handleSharesChange(e.target.value)} autoFocus />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Price per share ({txn.currency})</label>
        <AmountInput className={styles.formInput} value={price} onChange={v => setPrice(v)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Fee ({txn.currency})</label>
        <AmountInput className={styles.formInput} value={fee} onChange={v => setFee(v)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Transaction ID (optional)</label>
        <input className={styles.formInput} value={extId} onChange={e => setExtId(e.target.value)} placeholder="Broker reference" />
      </div>
      {proceeds > 0 && <p className={styles.ratePreview}>Net proceeds: {fmtAmt(proceeds - parseAmount(fee) || 0)} {txn.currency}</p>}
      {lotsWithCredit.length > 0 && (
        <div className={styles.lotPickerSection}>
          <button type="button" className={styles.lotPickerToggle} onClick={toggleLots}>
            {showLots ? '▲' : '▼'} Advanced: choose lots
          </button>
          {showLots && (
            <div className={styles.lotList}>
              {lotsWithCredit.map(lot => (
                <div key={lot.id} className={styles.lotRow}>
                  <span className={styles.lotMeta}>{lot.date} · {trimDecimals(lot.remainingShares)} sh @ {fmtAmt(lot.price)}</span>
                  <input
                    className={styles.lotInput}
                    type="number" min="0" max={lot.remainingShares} step="any"
                    value={lotInputs[lot.id] ?? '0'}
                    onChange={e => handleLotChange(lot.id, e.target.value)}
                  />
                  <span className={styles.lotMaxHint}>max {trimDecimals(lot.remainingShares)}</span>
                </div>
              ))}
              {!lotValid && (
                <p className={styles.fieldError}>
                  Lot totals ({trimDecimals(lotTotal)}) must equal shares to sell ({shares}).
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!canSave}>Save</button>
      </div>
    </form>
  )
}
