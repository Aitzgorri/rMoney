import { useState } from 'react'
import { getStockProfile } from '../data/stockProfiles'
import styles from './AddManualStockDialog.module.css'

// Manual-stock creation form (Phase 32e / SPEC-029).
// Used for assets the market data providers cannot identify or quote:
// pre-IPO RSUs, private equity, custom-tracked baskets, delisted holdings
// the user still wants to follow. The created profile carries
// `isManual: true` so every provider read is short-circuited downstream.
export default function AddManualStockDialog({ onConfirm, onCancel }) {
  const [ticker, setTicker]       = useState('')
  const [name, setName]           = useState('')
  const [stockExchange, setStockExchange] = useState('MANUAL')
  const [currency, setCurrency]   = useState('USD')
  const [hqCountry, setHqCountry] = useState('')
  const [error, setError]         = useState('')

  const normTicker = ticker.trim().toUpperCase()
  const canSave = normTicker && name.trim() && currency.trim()

  function handleSave() {
    if (!canSave) return
    if (getStockProfile(normTicker)) {
      setError(`Ticker "${normTicker}" already exists. Choose a different symbol or edit the existing profile.`)
      return
    }
    onConfirm({
      ticker: normTicker,
      name: name.trim(),
      stockExchange: stockExchange.trim() || 'MANUAL',
      currency: currency.trim().toUpperCase(),
      hqCountry: hqCountry.trim() || null,
    })
  }

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.box}>
        <h2 className={styles.title}>Add manual stock</h2>
        <p className={styles.note}>
          For assets the market data providers can't identify or quote — pre-IPO RSUs,
          private equity, custom baskets, or delisted holdings you still track.
          You'll enter the prices yourself.
        </p>

        <div className={styles.field}>
          <label className={styles.label}>Ticker</label>
          <input
            className={styles.input}
            value={ticker}
            onChange={e => { setTicker(e.target.value.toUpperCase()); setError('') }}
            placeholder="e.g. MY-RSU"
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Name</label>
          <input
            className={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Company / asset name"
          />
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label}>Exchange</label>
            <input
              className={styles.input}
              value={stockExchange}
              onChange={e => setStockExchange(e.target.value)}
              placeholder="MANUAL"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Currency</label>
            <input
              className={styles.input}
              value={currency}
              onChange={e => setCurrency(e.target.value.toUpperCase())}
              placeholder="USD"
              maxLength={4}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>HQ country (optional)</label>
          <input
            className={styles.input}
            value={hqCountry}
            onChange={e => setHqCountry(e.target.value)}
            placeholder="e.g. United States"
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={!canSave}>
            Add manual stock
          </button>
        </div>
      </div>
    </div>
  )
}
