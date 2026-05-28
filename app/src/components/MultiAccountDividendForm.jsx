import { useState, useEffect, useMemo } from 'react'
import { getInvestingAccounts } from '../data/investingAccounts'
import { getOpenLots } from '../data/stockTransactions'
import { createDividend, resolveDividendTaxPercent, computeDividendDerived, checkDuplicateDividend } from '../data/dividends'
import { getStockProfile, upsertStockProfile } from '../data/stockProfiles'
import CurrencyDropdown from './CurrencyDropdown'
import { fmtAmt } from '../utils/format'
import styles from './MultiAccountDividendForm.module.css'

function todayStr() { return new Date().toISOString().slice(0, 10) }

function dateMinusOneDay(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function trimDecimals(n) {
  return parseFloat(n.toFixed(8)).toString()
}

function sharesHeldOn(accountId, ticker, asOfDate) {
  if (!accountId || !ticker || !asOfDate) return 0
  return getOpenLots(accountId, ticker, asOfDate).reduce((s, l) => s + l.remainingShares, 0)
}

// ─── DuplicateDialog ─────────────────────────────────────────────────────────

function DuplicateDialog({ ticker, dupCheck, onClose, onAddAnyway }) {
  const { userRecords, apiRecords } = dupCheck
  return (
    <div className={styles.dupOverlay}>
      <div className={styles.dupDialog}>
        <h3 className={styles.dupTitle}>Duplicate dividend detected</h3>
        <p className={styles.dupMsg}>A dividend for {ticker} already exists on this date:</p>
        <ul className={styles.dupList}>
          {userRecords.map(d => (
            <li key={d.id}>
              Ex-div {d.exDividendDate} · Pay {d.payoutDate} · {d.dividendPerShare}/sh
              <span className={styles.dupSource}> (user record)</span>
            </li>
          ))}
          {apiRecords.map((r, i) => (
            <li key={i}>
              Ex-div {r.exDate} · Pay {r.payDate} · {r.perShare}/sh
              <span className={styles.dupSource}> (API record)</span>
            </li>
          ))}
        </ul>
        <div className={styles.dupActions}>
          <button className={styles.dupSameBtn} onClick={onClose}>
            Same dividend — close without saving
          </button>
          <button className={styles.dupDiffBtn} onClick={onAddAnyway}>
            Different dividend — add anyway
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MultiAccountDividendForm ─────────────────────────────────────────────────
//
// Props:
//   ticker        – fixed ticker string when tickerLocked=true, or initial value when false
//   tickerLocked  – when true the ticker field is read-only (stock-page entry)
//   heldTickers   – list of tickers the user holds (used for the selector when tickerLocked=false)
//   onSaved()     – called after all dividend records have been created
//   onCancel()    – called when the user cancels

export default function MultiAccountDividendForm({ ticker: initialTicker = '', tickerLocked = false, heldTickers = [], onSaved, onCancel }) {
  const [ticker, setTicker] = useState(initialTicker)
  const [currency, setCurrency] = useState(() => {
    if (initialTicker) {
      const p = getStockProfile(initialTicker)
      return p?.currency ?? 'USD'
    }
    return 'USD'
  })
  const [exDividendDate, setExDividendDate] = useState(todayStr)
  const [payoutDate, setPayoutDate] = useState(todayStr)
  const [perShare, setPerShare] = useState('')
  const [dividendType, setDividendType] = useState('regular')
  const [taxPctStr, setTaxPctStr] = useState(() => String(resolveDividendTaxPercent(initialTicker)))

  // Per-account rows: { accountId, accountName, shares, include, autoFilledDate }
  const [accountRows, setAccountRows] = useState([])

  // paysDividends === false escape hatch (only relevant when tickerLocked=false)
  const [noDivPrompt, setNoDivPrompt] = useState(false)

  // Duplicate warning
  const [dupCheck, setDupCheck] = useState(null)

  const accounts = useMemo(() => getInvestingAccounts(), [])
  const lookupDate = dateMinusOneDay(exDividendDate)

  // Recompute account rows when ticker or lookupDate changes
  useEffect(() => {
    if (!ticker) { setAccountRows([]); return }
    setAccountRows(
      accounts.map(acc => {
        const shares = sharesHeldOn(acc.id, ticker, lookupDate)
        return {
          accountId: acc.id,
          accountName: acc.name,
          shares: shares > 0 ? trimDecimals(shares) : '',
          include: shares > 0,
          autoFilledDate: shares > 0 ? lookupDate : null,
        }
      })
    )
  }, [ticker, lookupDate, accounts])

  function handleTickerChange(t) {
    if (!t) { setTicker(''); return }
    const profile = getStockProfile(t)
    if (profile?.paysDividends === false) {
      setTicker(t)
      setNoDivPrompt(true)
      return
    }
    setTicker(t)
    setNoDivPrompt(false)
    setCurrency(profile?.currency ?? 'USD')
    setTaxPctStr(String(resolveDividendTaxPercent(t)))
  }

  function handleClearFlagAndContinue() {
    upsertStockProfile(ticker, { paysDividends: null })
    setNoDivPrompt(false)
    const profile = getStockProfile(ticker)
    setCurrency(profile?.currency ?? 'USD')
    setTaxPctStr(String(resolveDividendTaxPercent(ticker)))
  }

  function handleIncludeToggle(accountId, checked) {
    setAccountRows(prev => prev.map(r => {
      if (r.accountId !== accountId) return r
      if (checked) {
        const shares = sharesHeldOn(accountId, ticker, lookupDate)
        return { ...r, include: true, shares: shares > 0 ? trimDecimals(shares) : '', autoFilledDate: shares > 0 ? lookupDate : null }
      }
      return { ...r, include: false }
    }))
  }

  function handleShareCountChange(accountId, v) {
    setAccountRows(prev => prev.map(r =>
      r.accountId === accountId ? { ...r, shares: v, autoFilledDate: null } : r
    ))
  }

  const taxPctNum = parseFloat(taxPctStr || '0')
  const includedRows = accountRows.filter(r => r.include && Number(r.shares || 0) > 0)
  const canSave = ticker && !noDivPrompt && currency && Number(perShare) > 0 && includedRows.length > 0 && payoutDate

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    const dup = checkDuplicateDividend(ticker, exDividendDate, payoutDate)
    if (dup) { setDupCheck(dup); return }
    doSave()
  }

  function doSave() {
    const taxPercent = parseFloat(taxPctStr || '0')
    for (const row of includedRows) {
      createDividend({
        investingAccountId: row.accountId,
        ticker,
        currency,
        exDividendDate,
        payoutDate,
        dividendPerShare: Number(perShare),
        shareCount: Number(row.shares),
        taxPercent,
        type: dividendType,
      })
    }
    onSaved()
  }

  const anyHoldings = accountRows.some(r => r.shares !== '')

  return (
    <>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h3 className={styles.title}>New dividend{ticker ? ` — ${ticker}` : ''}</h3>

        {/* Ticker + Currency */}
        <div className={styles.pairRow}>
          <div className={styles.field}>
            <label className={styles.label}>Ticker</label>
            {tickerLocked ? (
              <span className={styles.locked}>{ticker}</span>
            ) : (
              <select className={styles.select} value={ticker} onChange={e => handleTickerChange(e.target.value)}>
                <option value="">— select ticker —</option>
                {heldTickers.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Currency</label>
            <CurrencyDropdown className={styles.input} value={currency} onChange={setCurrency} />
          </div>
        </div>

        {/* paysDividends escape hatch (DividendPage entry only) */}
        {noDivPrompt && (
          <div className={styles.noDivPrompt}>
            <span>{ticker} is marked as not paying dividends. Clear flag and add anyway?</span>
            <div className={styles.noDivActions}>
              <button type="button" className={styles.noDivCancel} onClick={() => { setTicker(''); setNoDivPrompt(false) }}>Cancel</button>
              <button type="button" className={styles.noDivClear} onClick={handleClearFlagAndContinue}>Clear flag and continue</button>
            </div>
          </div>
        )}

        {!noDivPrompt && (
          <>
            {/* Type */}
            <div className={styles.field}>
              <label className={styles.label}>Type</label>
              <select className={styles.select} value={dividendType} onChange={e => setDividendType(e.target.value)}>
                <option value="regular">Regular</option>
                <option value="special">Special</option>
              </select>
            </div>

            {/* Dates */}
            <div className={styles.pairRow}>
              <div className={styles.field}>
                <label className={styles.label}>Ex-div date</label>
                <input className={styles.input} type="date" value={exDividendDate} onChange={e => setExDividendDate(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Payout date</label>
                <input className={styles.input} type="date" value={payoutDate} onChange={e => setPayoutDate(e.target.value)} />
              </div>
            </div>

            {/* Per share + Tax % */}
            <div className={styles.pairRow}>
              <div className={styles.field}>
                <label className={styles.label}>Per share ({currency})</label>
                <input className={styles.input} type="number" min="0" step="any" value={perShare} onChange={e => setPerShare(e.target.value)} placeholder="0.25" autoFocus={tickerLocked} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Tax %</label>
                <input className={styles.input} style={{ width: '80px' }} type="number" min="0" max="100" step="any" value={taxPctStr} onChange={e => setTaxPctStr(e.target.value)} placeholder="0" />
              </div>
            </div>

            {/* Account rows */}
            {ticker && (
              <div className={styles.accountSection}>
                <label className={styles.label}>
                  Accounts{lookupDate ? ` — holdings on ${lookupDate}` : ''}
                </label>
                {accountRows.length === 0 ? (
                  <p className={styles.noAccounts}>No investing accounts found.</p>
                ) : (
                  <table className={styles.accountTable}>
                    <thead>
                      <tr>
                        <th className={styles.th}></th>
                        <th className={styles.th}>Account</th>
                        <th className={styles.th + ' ' + styles.numTh}>Shares</th>
                        <th className={styles.th + ' ' + styles.numTh}>Net total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountRows.map(row => {
                        const sc = Number(row.shares || 0)
                        const tbt = Number(perShare || 0) * sc
                        const net = tbt - tbt * taxPctNum / 100
                        return (
                          <tr key={row.accountId} className={!row.include ? styles.rowMuted : ''}>
                            <td className={styles.td}>
                              <input
                                type="checkbox"
                                checked={row.include}
                                onChange={e => handleIncludeToggle(row.accountId, e.target.checked)}
                              />
                            </td>
                            <td className={styles.td}>{row.accountName}</td>
                            <td className={styles.td + ' ' + styles.numTd}>
                              <input
                                className={styles.sharesInput}
                                type="number"
                                min="0.000001"
                                step="any"
                                value={row.shares}
                                disabled={!row.include}
                                onChange={e => handleShareCountChange(row.accountId, e.target.value)}
                                placeholder="0"
                              />
                              {row.autoFilledDate && (
                                <span className={styles.autoHint} title={`Auto-filled from lots on ${row.autoFilledDate}`}>auto</span>
                              )}
                            </td>
                            <td className={styles.td + ' ' + styles.numTd}>
                              {row.include && sc > 0 && Number(perShare) > 0
                                ? `${fmtAmt(net)} ${currency}`
                                : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
                {ticker && !anyHoldings && (
                  <p className={styles.noHoldings}>No shares held in any account on {lookupDate ?? 'this date'} — enter share counts manually.</p>
                )}
              </div>
            )}
          </>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button type="submit" className={styles.saveBtn} disabled={!canSave}>
            Save{includedRows.length > 1 ? ` (${includedRows.length} records)` : ''}
          </button>
        </div>
      </form>

      {dupCheck && (
        <DuplicateDialog
          ticker={ticker}
          dupCheck={dupCheck}
          onClose={() => { setDupCheck(null); onCancel() }}
          onAddAnyway={() => { setDupCheck(null); doSave() }}
        />
      )}
    </>
  )
}
