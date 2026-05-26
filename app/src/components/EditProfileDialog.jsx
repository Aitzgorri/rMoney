import { useState, useEffect } from 'react'
import { getStockProfile, upsertStockProfile } from '../data/stockProfiles'
import { getMarketProfile } from '../data/marketDataClient'
import CurrencyDropdown from './CurrencyDropdown'
import styles from './EditProfileDialog.module.css'

export default function EditProfileDialog({ ticker, profile: profileProp, onSave, onCancel }) {
  // Read fresh from localStorage at mount — the background getMarketProfile fetch may have
  // written hqCountry after the parent's state snapshot was taken.
  const [profile] = useState(() => getStockProfile(ticker) ?? profileProp)

  const [name,      setName]      = useState(profile?.name ?? '')
  const [exchange,  setExchange]  = useState(profile?.stockExchange ?? '')
  const [currency,  setCurrency]  = useState(profile?.currency ?? '')
  // Pre-populate with the effective value so the user sees the current country.
  // Saving always writes to hqCountryOverride; clearing the field sets it to null
  // and lets the auto-fetched hqCountry take over again.
  const [hqCountryOverride, setHqCountryOverride] = useState(
    profile?.hqCountryOverride ?? profile?.hqCountry ?? ''
  )
  const [fetchedHqCountry, setFetchedHqCountry] = useState(profile?.hqCountry ?? null)

  // Fire a non-blocking profile fetch so the country field reflects the provider value
  // even if the background fetch in StockProfileResolutionDialog hadn't completed yet.
  useEffect(() => {
    let cancelled = false
    getMarketProfile(ticker, profile?.stockExchange ?? null, { forceRefresh: true })
      .then(mp => {
        if (cancelled || !mp.hqCountry) return
        upsertStockProfile(ticker, { hqCountry: mp.hqCountry })
        setFetchedHqCountry(mp.hqCountry)
        // Only auto-fill the field if user hasn't typed an override
        setHqCountryOverride(prev => prev === '' ? mp.hqCountry : prev)
      })
      .catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [frequency, setFrequency] = useState(profile?.dividendFrequency ?? 'unknown')
  const [estRule,   setEstRule]   = useState(profile?.amountEstimationRule ?? 'last-paid')
  const [manualAmt, setManualAmt] = useState(String(profile?.manualEstimatedAmount ?? ''))

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      name:                 name.trim() || null,
      stockExchange:        exchange.trim().toUpperCase() || null,
      currency:             currency || null,
      hqCountryOverride:    hqCountryOverride.trim() || null,
      dividendFrequency:    frequency,
      amountEstimationRule: estRule,
      manualEstimatedAmount: estRule === 'manual' && manualAmt !== '' ? Number(manualAmt) : null,
    })
  }

  return (
    <div className={styles.dialogBackdrop} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.dialogBox}>
        <h2 className={styles.dialogTitle}>Edit profile — {ticker}</h2>
        <p className={styles.dialogNote}>To change the ticker symbol, use Rename ticker instead.</p>
        <form onSubmit={handleSubmit}>
          <div className={styles.dialogField}>
            <label className={styles.dialogLabel}>Company name</label>
            <input className={styles.dialogInput} value={name} onChange={e => setName(e.target.value)} placeholder="Apple Inc." autoFocus />
          </div>
          <div className={styles.dialogRow}>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Exchange (MIC)</label>
              <input className={styles.dialogInput} value={exchange} onChange={e => setExchange(e.target.value.toUpperCase())} placeholder="XNAS" maxLength={8} />
            </div>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Currency (ISO)</label>
              <CurrencyDropdown className={styles.dialogInput} value={currency} onChange={setCurrency} />
            </div>
          </div>
          <div className={styles.dialogField}>
            <label className={styles.dialogLabel}>HQ country</label>
            <input className={styles.dialogInput} value={hqCountryOverride} onChange={e => setHqCountryOverride(e.target.value)} placeholder="US" />
            {fetchedHqCountry && profile?.hqCountryOverride && fetchedHqCountry !== profile.hqCountryOverride && (
              <p className={styles.dialogHint}>Provider-fetched: <strong>{fetchedHqCountry}</strong></p>
            )}
          </div>
          <div className={styles.dialogRow}>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Dividend frequency</label>
              <select className={styles.dialogSelect} value={frequency} onChange={e => setFrequency(e.target.value)}>
                <option value="unknown">Unknown</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semi-annual">Semi-annual</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Dividend estimation</label>
              <select className={styles.dialogSelect} value={estRule} onChange={e => setEstRule(e.target.value)}>
                <option value="last-paid">Last paid</option>
                <option value="year-ago">Year ago</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>
          {estRule === 'manual' && (
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Manual estimate (per share)</label>
              <input className={styles.dialogInput} type="number" min="0" step="any" value={manualAmt} onChange={e => setManualAmt(e.target.value)} placeholder="0.25" />
            </div>
          )}
          <div className={styles.dialogActions}>
            <button type="button" className={styles.dialogCancelBtn} onClick={onCancel}>Cancel</button>
            <button type="submit" className={styles.dialogSaveBtn}>Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}
