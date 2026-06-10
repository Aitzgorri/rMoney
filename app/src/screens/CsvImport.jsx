import { useState, useRef } from 'react'
import appStorage from '../utils/appStorage'
import {
  parseCSVText, detectDelimiter, detectDateFormat, applyMapping, validateRow, detectTypeValues,
  DATE_FORMATS, APP_FIELDS, APP_TYPES,
} from '../utils/csvParse'
import { getDefaultCsvDateFormat } from '../data/settings'
import {
  getCsvTemplates, getCsvTemplate, createCsvTemplate,
} from '../data/csvTemplates'
import {
  getInvestingAccount, updateInvestingAccount,
} from '../data/investingAccounts'
import { createBuy, createSell } from '../data/stockTransactions'
import { createDividend, resolveDividendTaxPercent } from '../data/dividends'
import { getStockProfile, upsertStockProfile } from '../data/stockProfiles'
import { fmtAmt } from '../utils/format'
import styles from './CsvImport.module.css'

// ─── CsvImport — multi-step wizard ───────────────────────────────────────────

export default function CsvImport({ accountId, onBack, onNavigate }) {
  const account  = getInvestingAccount(accountId)
  const templates = getCsvTemplates()

  // Step navigation
  const [step, setStep] = useState('setup')

  // ── Setup step ─────────────────────────────────────────────────────────────
  const [templateId, setTemplateId] = useState(account?.defaultCsvTemplateId ?? '')
  const [csvRows, setCsvRows]       = useState(null)   // null until file loaded
  const [fileName, setFileName]     = useState('')
  const [fileError, setFileError]   = useState(null)
  const [rawText,   setRawText]     = useState(null)   // raw file content for re-parsing
  const [delimiter, setDelimiter]   = useState(',')    // auto-detected or user-overridden
  const fileRef = useRef()

  // ── Map step ───────────────────────────────────────────────────────────────
  const [colMapping,   setColMapping]   = useState({})  // { colHeader: appField }
  const [dateFormat,   setDateFormat]   = useState(() => getDefaultCsvDateFormat())
  const [decimalSep,   setDecimalSep]   = useState('.')
  const [defaultType,  setDefaultType]  = useState('')
  const [typeValMap,   setTypeValMap]   = useState({})  // { csvTypeValue: appType }
  const [saveTemplate, setSaveTemplate] = useState(false)
  const [tplName,      setTplName]      = useState('')
  const [setAsDefault, setSetAsDefault] = useState(false)

  // ── Preview step ───────────────────────────────────────────────────────────
  const [validated, setValidated] = useState([])  // [{ rowIndex, errors, parsed, skip }]
  const [skipped,   setSkipped]   = useState(new Set())

  // ── Done step ──────────────────────────────────────────────────────────────
  const [result, setResult] = useState(null)
  const [reportFilter, setReportFilter] = useState('all')
  const [editingRow, setEditingRow] = useState(null)  // rowResult being inline-edited
  const [editValues, setEditValues] = useState({})
  const [editErrors, setEditErrors] = useState([])

  // ── File reading ───────────────────────────────────────────────────────────
  function doParse(text, delim) {
    try {
      const rows = parseCSVText(text, delim)
      if (rows.length < 2) { setFileError('File has no data rows (or wrong delimiter).'); setCsvRows(null); return }
      setCsvRows(rows)
      setFileError(null)
      if (templateId) {
        const tpl = getCsvTemplate(templateId)
        if (tpl) initFromTemplate(rows, tpl)
      }
    } catch { setFileError('Could not parse file as CSV.'); setCsvRows(null) }
  }

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileError(null)
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target.result
      const detectedDelim = detectDelimiter(text)
      setRawText(text)
      setDelimiter(detectedDelim)
      setFileName(file.name)
      doParse(text, detectedDelim)
    }
    reader.onerror = () => setFileError('Could not read file.')
    reader.readAsText(file)
  }

  function handleDelimiterChange(newDelim) {
    setDelimiter(newDelim)
    if (rawText) doParse(rawText, newDelim)
  }

  function initFromTemplate(rows, tpl) {
    const initialMapping = {}
    for (const [col, field] of Object.entries(tpl.mapping)) {
      if (rows[0].includes(col)) initialMapping[col] = field
    }
    setColMapping(initialMapping)
    setDateFormat(tpl.dateFormat || 'YYYY-MM-DD')
    setDecimalSep(tpl.decimalSeparator || '.')
    setDefaultType(tpl.defaultTransactionType || '')
    setTypeValMap(tpl.typeValueMap || {})
  }

  // ── Step transitions ───────────────────────────────────────────────────────
  function goToMap() {
    if (!csvRows) return
    const headers = csvRows[0]

    // Pre-fill mapping: guess by column name similarity
    const guessed = {}
    for (const col of headers) {
      const lower = col.toLowerCase().replace(/[\s_-]+/g, '')
      for (const f of APP_FIELDS) {
        if (f.value === '__ignore__') continue
        if (
          lower === f.value.toLowerCase() ||
          lower.includes(f.value.toLowerCase()) ||
          guessMatch(lower, f.value)
        ) {
          guessed[col] = f.value
          break
        }
      }
    }
    setColMapping(prev => ({ ...guessed, ...prev }))

    // Auto-detect date format from the guessed date column
    const dateColEntry = Object.entries(guessed).find(([, v]) => v === 'date' || v === 'payoutDate' || v === 'exDividendDate')
    if (dateColEntry) {
      const colIdx = headers.indexOf(dateColEntry[0])
      if (colIdx >= 0) {
        const samples = csvRows.slice(1, 6).map(row => row[colIdx] ?? '')
        const detected = detectDateFormat(samples)
        if (detected) setDateFormat(detected)
      }
    }

    // Auto-populate type value map: if CSV type values match app types case-insensitively, pre-fill them
    const typeColEntry = Object.entries(guessed).find(([, v]) => v === 'type')
    if (typeColEntry) {
      const csvTypeVals = detectTypeValues(csvRows, typeColEntry[0])
      const autoMap = {}
      for (const v of csvTypeVals) {
        const lower = v.toLowerCase()
        if (APP_TYPES.includes(lower)) autoMap[v] = lower
      }
      if (Object.keys(autoMap).length > 0) setTypeValMap(prev => ({ ...autoMap, ...prev }))
    }

    setStep('map')
  }

  function goToPreview() {
    const tvm = Object.values(colMapping).includes('type') ? typeValMap : null
    const raw = applyMapping(csvRows, colMapping, defaultType || null, tvm)
    const results = raw.map(obj => {
      const { errors, parsed } = validateRow(obj, dateFormat, decimalSep)
      return { rowIndex: obj._rowIndex, errors, parsed, raw: obj }
    })
    setValidated(results)
    setSkipped(new Set(results.filter(r => r.errors.length > 0).map(r => r.rowIndex)))
    setStep('preview')
  }

  function toggleSkip(rowIndex) {
    setSkipped(prev => {
      const next = new Set(prev)
      next.has(rowIndex) ? next.delete(rowIndex) : next.add(rowIndex)
      return next
    })
  }

  // ── Commit ─────────────────────────────────────────────────────────────────
  function commit() {
    const existingExtIds    = collectExternalIds(accountId)
    const existingTxnKeys   = collectTransactionCompositeKeys(accountId)
    const existingDivKeys   = collectDividendCompositeKeys(accountId)

    const rowResults = []
    const committed  = []

    for (const row of validated) {
      const p        = row.parsed
      const hasErrs  = row.errors.length > 0
      const isSkipped = skipped.has(row.rowIndex)

      if (hasErrs) {
        rowResults.push({ rowIndex: row.rowIndex, status: 'skipped', reasonCode: 'validation-error', reason: row.errors.join(' · '), parsed: p })
        continue
      }
      if (isSkipped) {
        rowResults.push({ rowIndex: row.rowIndex, status: 'skipped', reasonCode: 'user-skipped', reason: 'Skipped by user', parsed: p })
        continue
      }
      if (p.type === 'transfer') {
        rowResults.push({ rowIndex: row.rowIndex, status: 'skipped', reasonCode: 'transfer', reason: 'Transfer rows not yet supported', parsed: p })
        continue
      }

      // Composite-key dedup (items 439–440)
      if (p.type === 'buy' || p.type === 'sell') {
        const extId = p.transactionExternalId
        if (extId && existingExtIds.has(extId)) {
          rowResults.push({ rowIndex: row.rowIndex, status: 'duplicate', reasonCode: 'duplicate-external-id', reason: 'Duplicate external ID', parsed: p })
          continue
        }
        if (!extId && existingTxnKeys.has(txnCompositeKey(p))) {
          rowResults.push({ rowIndex: row.rowIndex, status: 'duplicate', reasonCode: 'duplicate-composite', reason: 'Duplicate — matching existing transaction', parsed: p })
          continue
        }
      } else if (p.type === 'dividend') {
        if (existingDivKeys.has(divCompositeKey(p))) {
          rowResults.push({ rowIndex: row.rowIndex, status: 'duplicate', reasonCode: 'duplicate-composite', reason: 'Duplicate — matching existing dividend', parsed: p })
          continue
        }
      }

      try {
        let importedId = null
        if (p.type === 'buy') {
          const rec = createBuy({
            investingAccountId: accountId,
            date: p.date, ticker: p.ticker, stockExchange: p.stockExchange,
            shares: p.shares, price: p.price, currency: p.currency,
            fee: p.fee, transactionExternalId: p.transactionExternalId,
          })
          importedId = rec.id
          committed.push({ type: 'buy', id: rec.id })
        } else if (p.type === 'sell') {
          const rec = createSell({
            investingAccountId: accountId,
            date: p.date, ticker: p.ticker, stockExchange: p.stockExchange,
            shares: p.shares, price: p.price, currency: p.currency,
            fee: p.fee, transactionExternalId: p.transactionExternalId,
          })
          importedId = rec.id
          committed.push({ type: 'sell', id: rec.id })
        } else if (p.type === 'dividend') {
          const taxPct = p.taxPercent > 0 ? p.taxPercent : resolveDividendTaxPercent(p.ticker)
          const rec = createDividend({
            investingAccountId: accountId,
            ticker: p.ticker, currency: p.currency,
            exDividendDate: p.exDividendDate, payoutDate: p.payoutDate,
            dividendPerShare: p.dividendPerShare, shareCount: p.shareCount,
            taxPercent: taxPct,
          })
          importedId = rec.id
          committed.push({ type: 'dividend', id: rec.id })
        }
        rowResults.push({ rowIndex: row.rowIndex, status: 'imported', reasonCode: null, reason: null, parsed: p, importedId })
      } catch (e) {
        rollback(committed)
        setResult({ error: `Import failed on row ${row.rowIndex}: ${e.message}. No records were saved.` })
        setStep('done')
        return
      }
    }

    // Save template if requested
    if (saveTemplate && tplName.trim() && csvRows) {
      const tvm = Object.values(colMapping).includes('type') ? typeValMap : null
      const newTpl = createCsvTemplate({
        name: tplName.trim(),
        dateFormat, decimalSeparator: decimalSep,
        mapping: colMapping,
        typeValueMap: tvm,
        defaultTransactionType: defaultType || null,
      })
      if (setAsDefault) updateInvestingAccount(accountId, { defaultCsvTemplateId: newTpl.id })
    } else if (setAsDefault && templateId) {
      updateInvestingAccount(accountId, { defaultCsvTemplateId: templateId })
    }

    // Stub profiles for every imported ticker
    const importedTickers = new Set(
      rowResults.filter(r => r.status === 'imported' && r.parsed.ticker).map(r => r.parsed.ticker)
    )
    for (const t of importedTickers) {
      if (!getStockProfile(t)) upsertStockProfile(t, {})
    }
    const needsConfirmation = [...importedTickers].filter(t => getStockProfile(t)?.confirmed !== true)

    setResult({ rowResults, needsConfirmation })
    setStep('done')
  }

  // ── Edit-row retry (inline fix for validation-error rows) ──────────────────
  function handleEditRetry(rr) {
    const v = editValues
    const errors = []
    const parsed = { _rowIndex: rr.rowIndex }

    const type = (v.type || '').trim().toLowerCase()
    if (!type || !['buy', 'sell', 'dividend', 'transfer'].includes(type)) {
      errors.push('Invalid transaction type')
    }
    parsed.type = type

    if (!v.ticker?.trim()) errors.push('Missing ticker')
    else parsed.ticker = v.ticker.trim().toUpperCase()

    if (!v.currency?.trim()) errors.push('Missing currency')
    else parsed.currency = v.currency.trim().toUpperCase()

    const isoRe = /^\d{4}-\d{2}-\d{2}$/

    if (type === 'buy' || type === 'sell') {
      if (!isoRe.test(v.date?.trim())) errors.push('Invalid date — use YYYY-MM-DD')
      else parsed.date = v.date.trim()

      const sh = parseFloat(v.shares)
      if (!isFinite(sh) || sh <= 0) errors.push('Invalid shares (must be > 0)')
      else parsed.shares = sh

      const pr = parseFloat(v.price)
      if (!isFinite(pr) || pr < 0) errors.push('Invalid price')
      else parsed.price = pr

      parsed.fee = parseFloat(v.fee) || 0
      parsed.stockExchange = v.stockExchange?.trim() || null
      parsed.transactionExternalId = v.transactionExternalId?.trim() || null

    } else if (type === 'dividend') {
      if (!isoRe.test(v.payoutDate?.trim())) errors.push('Invalid payout date — use YYYY-MM-DD')
      else parsed.payoutDate = v.payoutDate.trim()
      parsed.exDividendDate = isoRe.test(v.exDividendDate?.trim()) ? v.exDividendDate.trim() : parsed.payoutDate

      const dps = parseFloat(v.dividendPerShare)
      if (!isFinite(dps) || dps < 0) errors.push('Invalid dividend per share')
      else parsed.dividendPerShare = dps

      const sc = parseFloat(v.shareCount)
      if (!isFinite(sc) || sc <= 0) errors.push('Invalid share count (must be > 0)')
      else parsed.shareCount = sc

      parsed.taxPercent = parseFloat(v.taxPercent) || 0
      parsed.transactionExternalId = null
    }

    if (errors.length > 0) { setEditErrors(errors); return }

    // Re-check dedup
    const existingExtIds  = collectExternalIds(accountId)
    const existingTxnKeys = collectTransactionCompositeKeys(accountId)
    const existingDivKeys = collectDividendCompositeKeys(accountId)

    let newStatus = null, newReasonCode = null, newReason = null, importedId = null

    if (type === 'buy' || type === 'sell') {
      const extId = parsed.transactionExternalId
      if (extId && existingExtIds.has(extId)) {
        newStatus = 'duplicate'; newReasonCode = 'duplicate-external-id'; newReason = 'Duplicate external ID'
      } else if (!extId && existingTxnKeys.has(txnCompositeKey(parsed))) {
        newStatus = 'duplicate'; newReasonCode = 'duplicate-composite'; newReason = 'Duplicate — matching existing transaction'
      }
    } else if (type === 'dividend') {
      if (existingDivKeys.has(divCompositeKey(parsed))) {
        newStatus = 'duplicate'; newReasonCode = 'duplicate-composite'; newReason = 'Duplicate — matching existing dividend'
      }
    }

    if (!newStatus) {
      try {
        if (type === 'buy') {
          const rec = createBuy({ investingAccountId: accountId, ...parsed })
          importedId = rec.id
        } else if (type === 'sell') {
          const rec = createSell({ investingAccountId: accountId, ...parsed })
          importedId = rec.id
        } else if (type === 'dividend') {
          const taxPct = parsed.taxPercent > 0 ? parsed.taxPercent : resolveDividendTaxPercent(parsed.ticker)
          const rec = createDividend({ investingAccountId: accountId, ...parsed, taxPercent: taxPct })
          importedId = rec.id
        }
        newStatus = 'imported'; newReasonCode = null; newReason = null
        if (!getStockProfile(parsed.ticker)) upsertStockProfile(parsed.ticker, {})
      } catch (e) {
        setEditErrors([`Commit failed: ${e.message}`])
        return
      }
    }

    setResult(prev => {
      const needsTicker = newStatus === 'imported' && parsed.ticker && getStockProfile(parsed.ticker)?.confirmed !== true
      const prevNC = prev.needsConfirmation || []
      const newNC = needsTicker && !prevNC.includes(parsed.ticker) ? [...prevNC, parsed.ticker] : prevNC
      return {
        ...prev,
        rowResults: prev.rowResults.map(r =>
          r.rowIndex === rr.rowIndex
            ? { ...r, status: newStatus, reasonCode: newReasonCode, reason: newReason, parsed, importedId }
            : r
        ),
        needsConfirmation: newNC,
      }
    })
    setEditingRow(null)
    setEditErrors([])
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (step === 'done') {
    if (result.error) {
      return (
        <div className={styles.screen}>
          <div className={styles.header}>
            <button className={styles.backBtn} onClick={onBack}>←</button>
            <h1 className={styles.title}>Import failed</h1>
          </div>
          <div className={styles.doneCard}>
            <div className={`${styles.doneStat} ${styles.doneStatErr}`}>{result.error}</div>
            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={onBack}>Close</button>
            </div>
          </div>
        </div>
      )
    }

    const { rowResults, needsConfirmation } = result
    const importedRows    = rowResults.filter(r => r.status === 'imported')
    const dupRows         = rowResults.filter(r => r.status === 'duplicate')
    const errorRows       = rowResults.filter(r => r.reasonCode === 'validation-error')
    const notImportedRows = rowResults.filter(r => r.status !== 'imported')

    let displayRows = rowResults
    if (reportFilter === 'imported')     displayRows = importedRows
    else if (reportFilter === 'not-imported') displayRows = notImportedRows
    else if (reportFilter === 'errors')   displayRows = errorRows

    return (
      <div className={styles.screen}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={onBack}>←</button>
          <h1 className={styles.title}>Import complete</h1>
        </div>

        {/* Summary + needs-confirmation card */}
        <div className={styles.doneCard}>
          <div className={styles.doneTitle}>Done</div>
          <div className={`${styles.doneStat} ${styles.doneStatGood}`}>
            <strong>{importedRows.length}</strong> record{importedRows.length !== 1 ? 's' : ''} imported
          </div>
          {dupRows.length > 0 && (
            <div className={`${styles.doneStat} ${styles.doneStatWarn}`}>
              <strong>{dupRows.length}</strong> duplicate{dupRows.length !== 1 ? 's' : ''} skipped
            </div>
          )}
          {errorRows.length > 0 && (
            <div className={`${styles.doneStat} ${styles.doneStatErr}`}>
              <strong>{errorRows.length}</strong> row{errorRows.length !== 1 ? 's' : ''} with errors skipped
            </div>
          )}
          {needsConfirmation?.length > 0 && (
            <div className={styles.needsConfirmCard}>
              <div className={styles.needsConfirmTitle}>
                {needsConfirmation.length} ticker{needsConfirmation.length !== 1 ? 's' : ''} need{needsConfirmation.length === 1 ? 's' : ''} confirmation
              </div>
              <div className={styles.needsConfirmList}>{renderTickerList(needsConfirmation)}</div>
              <div className={styles.needsConfirmNote}>
                These tickers were imported without a confirmed mapping to a real security.
                Confirm each one to be sure it points to the company you intended.
              </div>
              <button
                className={styles.btnSecondary}
                onClick={() => onNavigate?.('stock-inventory', { confirmFilter: 'unconfirmed' })}
              >
                Review in Stock inventory
              </button>
            </div>
          )}
          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={onBack}>Close</button>
          </div>
        </div>

        {/* Per-row report (item 441) */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Import report</div>

          {/* Filter pills */}
          <div className={styles.reportFilterPills}>
            {[
              ['all',          `All (${rowResults.length})`],
              ['imported',     `Imported (${importedRows.length})`],
              ['not-imported', `Not imported (${notImportedRows.length})`],
              ['errors',       `Errors (${errorRows.length})`],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`${styles.filterPill} ${reportFilter === key ? styles.filterPillActive : ''}`}
                onClick={() => setReportFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Report rows */}
          <div className={styles.reportTable}>
            {displayRows.length === 0 && (
              <div className={styles.reportEmpty}>No rows match this filter.</div>
            )}
            {displayRows.map(rr => {
              const isEditing = editingRow?.rowIndex === rr.rowIndex
              const type = rr.parsed?.type
              return (
                <div key={rr.rowIndex} className={`${styles.reportRow} ${styles['reportRow_' + rr.status]}`}>
                  <div className={styles.reportRowMain}>
                    <span className={styles.reportLine}>{rr.rowIndex}</span>
                    <div className={styles.reportRowContent}>
                      <div className={styles.reportDesc}>{describeRow(rr.parsed)}</div>
                      {rr.status !== 'imported' && rr.reason && (
                        <div className={styles.reportReason}>{rr.reason}</div>
                      )}
                    </div>
                    <span className={reportStatusClass(rr, styles)}>{reportStatusLabel(rr)}</span>
                    <span className={styles.reportActions}>
                      {rr.reasonCode === 'validation-error' && (
                        <button
                          className={styles.rowActionBtn}
                          onClick={() => {
                            if (isEditing) { setEditingRow(null); setEditErrors([]) }
                            else { setEditingRow(rr); setEditValues(buildEditValues(rr.parsed)); setEditErrors([]) }
                          }}
                        >
                          {isEditing ? 'Cancel' : 'Edit row'}
                        </button>
                      )}
                      {rr.status === 'duplicate' && (
                        <button
                          className={styles.rowActionBtn}
                          onClick={() => {
                            if (type === 'dividend') onNavigate?.('dividends')
                            else onNavigate?.('stock', { ticker: rr.parsed.ticker })
                          }}
                        >
                          View existing
                        </button>
                      )}
                    </span>
                  </div>

                  {/* Inline edit form */}
                  {isEditing && (
                    <div className={styles.inlineEditForm}>
                      <div className={styles.inlineEditGrid}>
                        <div className={styles.editField}>
                          <label className={styles.label}>Type</label>
                          <select className={styles.select} value={editValues.type ?? ''} onChange={e => setEditValues(p => ({ ...p, type: e.target.value }))}>
                            <option value="">— select —</option>
                            {['buy','sell','dividend','transfer'].map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className={styles.editField}>
                          <label className={styles.label}>Ticker</label>
                          <input className={styles.input} value={editValues.ticker ?? ''} onChange={e => setEditValues(p => ({ ...p, ticker: e.target.value }))} />
                        </div>
                        <div className={styles.editField}>
                          <label className={styles.label}>Currency</label>
                          <input className={styles.input} value={editValues.currency ?? ''} onChange={e => setEditValues(p => ({ ...p, currency: e.target.value }))} />
                        </div>
                        {(editValues.type === 'buy' || editValues.type === 'sell') && (<>
                          <div className={styles.editField}>
                            <label className={styles.label}>Date (YYYY-MM-DD)</label>
                            <input className={styles.input} value={editValues.date ?? ''} onChange={e => setEditValues(p => ({ ...p, date: e.target.value }))} />
                          </div>
                          <div className={styles.editField}>
                            <label className={styles.label}>Shares</label>
                            <input className={styles.input} type="number" value={editValues.shares ?? ''} onChange={e => setEditValues(p => ({ ...p, shares: e.target.value }))} />
                          </div>
                          <div className={styles.editField}>
                            <label className={styles.label}>Price</label>
                            <input className={styles.input} type="number" value={editValues.price ?? ''} onChange={e => setEditValues(p => ({ ...p, price: e.target.value }))} />
                          </div>
                          <div className={styles.editField}>
                            <label className={styles.label}>Fee</label>
                            <input className={styles.input} type="number" value={editValues.fee ?? ''} onChange={e => setEditValues(p => ({ ...p, fee: e.target.value }))} />
                          </div>
                          <div className={styles.editField}>
                            <label className={styles.label}>Exchange (optional)</label>
                            <input className={styles.input} value={editValues.stockExchange ?? ''} onChange={e => setEditValues(p => ({ ...p, stockExchange: e.target.value }))} />
                          </div>
                        </>)}
                        {editValues.type === 'dividend' && (<>
                          <div className={styles.editField}>
                            <label className={styles.label}>Payout date (YYYY-MM-DD)</label>
                            <input className={styles.input} value={editValues.payoutDate ?? ''} onChange={e => setEditValues(p => ({ ...p, payoutDate: e.target.value }))} />
                          </div>
                          <div className={styles.editField}>
                            <label className={styles.label}>Ex-div date (YYYY-MM-DD)</label>
                            <input className={styles.input} value={editValues.exDividendDate ?? ''} onChange={e => setEditValues(p => ({ ...p, exDividendDate: e.target.value }))} />
                          </div>
                          <div className={styles.editField}>
                            <label className={styles.label}>Dividend per share</label>
                            <input className={styles.input} type="number" value={editValues.dividendPerShare ?? ''} onChange={e => setEditValues(p => ({ ...p, dividendPerShare: e.target.value }))} />
                          </div>
                          <div className={styles.editField}>
                            <label className={styles.label}>Share count</label>
                            <input className={styles.input} type="number" value={editValues.shareCount ?? ''} onChange={e => setEditValues(p => ({ ...p, shareCount: e.target.value }))} />
                          </div>
                          <div className={styles.editField}>
                            <label className={styles.label}>Tax %</label>
                            <input className={styles.input} type="number" value={editValues.taxPercent ?? ''} onChange={e => setEditValues(p => ({ ...p, taxPercent: e.target.value }))} />
                          </div>
                        </>)}
                      </div>
                      {editErrors.length > 0 && (
                        <div className={styles.inlineEditErrors}>{editErrors.join(' · ')}</div>
                      )}
                      <div className={styles.inlineEditActions}>
                        <button className={styles.btnPrimary} style={{ padding: '6px 14px', fontSize: '12px' }} onClick={() => handleEditRetry(rr)}>Retry</button>
                        <button className={styles.btnSecondary} style={{ padding: '6px 14px', fontSize: '12px' }} onClick={() => { setEditingRow(null); setEditErrors([]) }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  if (step === 'preview') {
    const willImport  = validated.filter(r => !skipped.has(r.rowIndex) && r.errors.length === 0)
    const errorRows   = validated.filter(r => r.errors.length > 0)

    return (
      <div className={styles.screen}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => setStep(templateId ? 'setup' : 'map')}>←</button>
          <h1 className={styles.title}>Preview</h1>
        </div>
        <div className={styles.previewSummary}>
          <span className={styles.previewCount}>{validated.length}</span> rows parsed —{' '}
          <span className={styles.previewCount}>{willImport.length}</span> will import
          {errorRows.length > 0 && (
            <>, <span className={styles.previewErrors}>{errorRows.length} with errors (skipped by default)</span></>
          )}
        </div>

        <div className={styles.previewTable}>
          {validated.map(row => {
            const isSkipped = skipped.has(row.rowIndex)
            const hasErrors = row.errors.length > 0
            const p = row.parsed
            return (
              <div
                key={row.rowIndex}
                className={`${styles.previewRow} ${hasErrors ? styles.previewRowError : styles.previewRowOk} ${isSkipped ? styles.previewRowSkip : ''}`}
              >
                <span className={styles.previewRowNum}>{row.rowIndex}</span>
                <span className={styles.previewRowStatus}>{hasErrors ? '✗' : '✓'}</span>
                <div className={styles.previewRowDesc}>
                  {hasErrors ? (
                    <div className={styles.previewRowErrors}>{row.errors.join(' · ')}</div>
                  ) : (
                    describeRow(p)
                  )}
                </div>
                <button
                  className={styles.skipBtn}
                  onClick={() => toggleSkip(row.rowIndex)}
                  title={isSkipped ? 'Include this row' : 'Skip this row'}
                >
                  {isSkipped ? 'include' : 'skip'}
                </button>
              </div>
            )
          })}
        </div>

        <div className={styles.actions}>
          <button
            className={styles.btnPrimary}
            onClick={commit}
            disabled={willImport.length === 0}
          >
            Commit {willImport.length} row{willImport.length !== 1 ? 's' : ''}
          </button>
          <button className={styles.btnSecondary} onClick={() => setStep(templateId ? 'setup' : 'map')}>← Back</button>
        </div>
      </div>
    )
  }

  if (step === 'map') {
    const headers = csvRows?.[0] ?? []
    const typeColumn = Object.entries(colMapping).find(([, v]) => v === 'type')?.[0]
    const typeValues = typeColumn ? detectTypeValues(csvRows, typeColumn) : []
    const hasMappedType = !!typeColumn
    const hasDateCol = Object.values(colMapping).includes('date') || Object.values(colMapping).includes('payoutDate')

    return (
      <div className={styles.screen}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => setStep('setup')}>←</button>
          <h1 className={styles.title}>Map columns</h1>
        </div>
        <p className={styles.infoMsg}>
          File: <strong>{fileName}</strong> — {headers.length} columns, {(csvRows?.length ?? 1) - 1} data rows
        </p>

        <div className={styles.card}>
          <div className={styles.cardTitle}>Column mapping</div>
          <div className={styles.mappingTable}>
            <div className={styles.mappingHeader}>
              <span>CSV column</span>
              <span>App field</span>
            </div>
            {headers.map(col => (
              <div key={col} className={styles.mappingRow}>
                <span className={styles.colName}>{col}</span>
                <select
                  className={styles.select}
                  value={colMapping[col] ?? '__ignore__'}
                  onChange={e => setColMapping(prev => ({ ...prev, [col]: e.target.value }))}
                >
                  {APP_FIELDS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardTitle}>Format settings</div>
          <div className={styles.fieldRow}>
            <div className={styles.field} style={{ flex: 2 }}>
              <label className={styles.label}>Date format</label>
              <select className={styles.select} value={dateFormat} onChange={e => setDateFormat(e.target.value)}>
                {DATE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className={styles.field} style={{ flex: 1 }}>
              <label className={styles.label}>Decimal</label>
              <select className={styles.select} value={decimalSep} onChange={e => setDecimalSep(e.target.value)}>
                <option value=".">. (point)</option>
                <option value=",">, (comma)</option>
              </select>
            </div>
          </div>

          {!hasMappedType && (
            <div className={styles.field}>
              <label className={styles.label}>Default transaction type (when no type column)</label>
              <select className={styles.select} value={defaultType} onChange={e => setDefaultType(e.target.value)}>
                <option value="">— select —</option>
                {APP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {hasMappedType && typeValues.length > 0 && (
            <div className={styles.typeMapSection}>
              <div className={styles.typeMapTitle}>Map type values</div>
              {typeValues.map(tv => (
                <div key={tv} className={styles.typeMapRow}>
                  <span className={styles.typeMapValue}>"{tv}"</span>
                  <span className={styles.typeMapArrow}>→</span>
                  <select
                    className={styles.select}
                    value={typeValMap[tv] ?? ''}
                    onChange={e => setTypeValMap(prev => ({ ...prev, [tv]: e.target.value }))}
                    style={{ flex: 1 }}
                  >
                    <option value="">— ignore —</option>
                    {APP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.cardTitle}>Save as template</div>
          <label className={styles.saveTemplateLabel}>
            <input
              type="checkbox"
              checked={saveTemplate}
              onChange={e => setSaveTemplate(e.target.checked)}
            />
            Save this mapping as a reusable template
          </label>
          {saveTemplate && (
            <div className={styles.field}>
              <label className={styles.label}>Template name</label>
              <input
                className={styles.input}
                type="text"
                value={tplName}
                onChange={e => setTplName(e.target.value)}
                placeholder="e.g. IBKR activity"
                autoFocus
              />
            </div>
          )}
          {saveTemplate && (
            <label className={styles.saveTemplateLabel}>
              <input
                type="checkbox"
                checked={setAsDefault}
                onChange={e => setSetAsDefault(e.target.checked)}
              />
              Set as default template for {account?.name}
            </label>
          )}
        </div>

        <div className={styles.actions}>
          <button
            className={styles.btnPrimary}
            onClick={goToPreview}
            disabled={!Object.values(colMapping).some(v => v !== '__ignore__')}
          >
            Preview →
          </button>
          <button className={styles.btnSecondary} onClick={() => setStep('setup')}>← Back</button>
        </div>
      </div>
    )
  }

  // step === 'setup'
  const canAdvance = !!csvRows
  const useExistingTemplate = !!templateId && !!getCsvTemplate(templateId)

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>←</button>
        <h1 className={styles.title}>Import CSV</h1>
      </div>
      <p className={styles.infoMsg}>
        Account: <strong>{account?.name}</strong> ({account?.institution})
      </p>

      {templates.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Template</div>
          <div className={styles.field}>
            <label className={styles.label}>Use existing template</label>
            <select className={styles.select} value={templateId} onChange={e => setTemplateId(e.target.value)}>
              <option value="">New template (map columns manually)</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {useExistingTemplate && (
            <label className={styles.saveTemplateLabel}>
              <input
                type="checkbox"
                checked={setAsDefault}
                onChange={e => setSetAsDefault(e.target.checked)}
              />
              Set as default template for {account?.name}
            </label>
          )}
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.cardTitle}>File</div>
        <div className={styles.filePicker}>
          <label className={styles.filePickerBtn}>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
            />
            {fileName ? `Change file — ${fileName}` : 'Click to select a CSV file'}
          </label>
          {fileName && !fileError && <div className={styles.fileName}>✓ {fileName}</div>}
          {fileError && <div className={styles.fileError}>✗ {fileError}</div>}
          {csvRows && (
            <div className={styles.infoMsg}>
              {csvRows[0].length} columns · {csvRows.length - 1} data rows
            </div>
          )}
        </div>
        {rawText && (
          <div className={styles.field}>
            <label className={styles.label}>Column delimiter (auto-detected)</label>
            <select className={styles.select} value={delimiter} onChange={e => handleDelimiterChange(e.target.value)}>
              <option value=",">, comma</option>
              <option value=";">; semicolon</option>
              <option value={'\t'}>⇥ tab</option>
            </select>
            {csvRows && delimiter !== ',' && (
              <span className={styles.warnMsg}>Detected: {delimiter === ';' ? 'semicolon' : 'tab'} — change if columns look wrong</span>
            )}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <button
          className={styles.btnPrimary}
          disabled={!canAdvance}
          onClick={() => {
            if (useExistingTemplate && csvRows) {
              // Apply template and skip to preview
              const tpl = getCsvTemplate(templateId)
              initFromTemplate(csvRows, tpl)
              const tvm = tpl.typeValueMap
              const raw = applyMapping(csvRows, tpl.mapping, tpl.defaultTransactionType, tvm)
              const results = raw.map(obj => {
                const { errors, parsed } = validateRow(obj, tpl.dateFormat, tpl.decimalSeparator)
                return { rowIndex: obj._rowIndex, errors, parsed }
              })
              setValidated(results)
              setSkipped(new Set(results.filter(r => r.errors.length > 0).map(r => r.rowIndex)))
              setStep('preview')
            } else {
              goToMap()
            }
          }}
        >
          {useExistingTemplate ? 'Preview →' : 'Map columns →'}
        </button>
        <button className={styles.btnSecondary} onClick={onBack}>Cancel</button>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Compact ticker list for the post-import "needs confirmation" card. Shows the
// first 10 names plus an "and N more" suffix when the list is long.
function renderTickerList(tickers) {
  const cap = 10
  if (tickers.length <= cap) return tickers.join(', ')
  return tickers.slice(0, cap).join(', ') + `, and ${tickers.length - cap} more`
}

function describeRow(p) {
  if (!p.type) return `Row ${p._rowIndex}`
  if (p.type === 'buy') {
    return `Buy  ${p.ticker}  ${p.shares} sh @ ${fmtAmt(p.price)} ${p.currency}${p.fee ? ` + ${fmtAmt(p.fee)} fee` : ''}  ${p.date}`
  }
  if (p.type === 'sell') {
    return `Sell  ${p.ticker}  ${p.shares} sh @ ${fmtAmt(p.price)} ${p.currency}  ${p.date}`
  }
  if (p.type === 'dividend') {
    const gross = (p.dividendPerShare ?? 0) * (p.shareCount ?? 0)
    return `Div  ${p.ticker}  ${fmtAmt(p.dividendPerShare)}/sh × ${p.shareCount}  gross ${fmtAmt(gross)} ${p.currency}  ${p.payoutDate}`
  }
  return `${p.type}  ${p.ticker ?? ''}  ${p.date ?? ''}`
}

// Guess common column-name synonyms
function guessMatch(lower, field) {
  const synonyms = {
    date: ['datetime', 'tradedate', 'purchasedate', 'settledate', 'transactiondate', 'activitydate'],
    ticker: ['symbol', 'stock', 'security', 'asset', 'instrument'],
    shares: ['quantity', 'qty', 'count', 'num', 'number', 'units', 'volume'],
    price: ['tradeprice', 'unitprice', 'closeprice', 'lastprice'],
    currency: ['ccy', 'curr'],
    fee: ['commission', 'brokerage', 'charges', 'cost'],
    type: ['action', 'transactiontype', 'buysell', 'buyselltype', 'side'],
    transactionExternalId: ['transactionid', 'tradeid', 'orderid', 'id', 'referenceid', 'ref'],
  }
  return synonyms[field]?.some(s => lower.includes(s)) ?? false
}

// ─── Dedup helpers ────────────────────────────────────────────────────────────

function txnCompositeKey(p) {
  return `${p.date}|${String(p.ticker || '').toUpperCase()}|${Number(p.shares).toFixed(6)}|${Number(p.price).toFixed(8)}|${p.type}`
}

function divCompositeKey(p) {
  return `${p.payoutDate}|${String(p.ticker || '').toUpperCase()}|${Number(p.shareCount).toFixed(6)}|${Number(p.dividendPerShare).toFixed(8)}|${String(p.currency || '').toUpperCase()}`
}

function collectExternalIds(investingAccountId) {
  const ids = new Set()
  try {
    const txns = JSON.parse(appStorage.getItem('rmoney_stock_transactions')) ?? []
    txns.filter(t => t.investingAccountId === investingAccountId && t.transactionExternalId)
        .forEach(t => ids.add(t.transactionExternalId))
    const divs = JSON.parse(appStorage.getItem('rmoney_dividends')) ?? []
    divs.filter(d => d.investingAccountId === investingAccountId && d.transactionExternalId)
        .forEach(d => ids.add(d.transactionExternalId))
  } catch {}
  return ids
}

function collectTransactionCompositeKeys(investingAccountId) {
  const keys = new Set()
  try {
    const txns = JSON.parse(appStorage.getItem('rmoney_stock_transactions')) ?? []
    txns
      .filter(t => t.investingAccountId === investingAccountId && (t.type === 'buy' || t.type === 'sell'))
      .forEach(t => keys.add(
        `${t.date}|${String(t.ticker || '').toUpperCase()}|${Number(t.shares).toFixed(6)}|${Number(t.price).toFixed(8)}|${t.type}`
      ))
  } catch {}
  return keys
}

function collectDividendCompositeKeys(investingAccountId) {
  const keys = new Set()
  try {
    const divs = JSON.parse(appStorage.getItem('rmoney_dividends')) ?? []
    divs
      .filter(d => d.investingAccountId === investingAccountId)
      .forEach(d => keys.add(
        `${d.payoutDate}|${String(d.ticker || '').toUpperCase()}|${Number(d.shareCount).toFixed(6)}|${Number(d.dividendPerShare).toFixed(8)}|${String(d.currency || '').toUpperCase()}`
      ))
  } catch {}
  return keys
}

// ─── Report helpers ───────────────────────────────────────────────────────────

function reportStatusLabel(rr) {
  if (rr.status === 'imported') return 'Imported'
  if (rr.status === 'duplicate') return rr.reasonCode === 'duplicate-external-id' ? 'Dup (ID)' : 'Duplicate'
  if (rr.reasonCode === 'validation-error') return 'Error'
  if (rr.reasonCode === 'user-skipped') return 'Skipped'
  if (rr.reasonCode === 'transfer') return 'Transfer'
  return 'Skipped'
}

function reportStatusClass(rr, styles) {
  if (rr.status === 'imported') return styles.statusImported
  if (rr.status === 'duplicate') return styles.statusDuplicate
  if (rr.reasonCode === 'validation-error') return styles.statusError
  return styles.statusSkipped
}

function buildEditValues(parsed) {
  const v = {}
  if (parsed?.type)          v.type          = parsed.type
  if (parsed?.ticker)        v.ticker        = parsed.ticker
  if (parsed?.currency)      v.currency      = parsed.currency
  if (parsed?.date)          v.date          = parsed.date
  if (parsed?.shares != null) v.shares       = String(parsed.shares)
  if (parsed?.price  != null) v.price        = String(parsed.price)
  if (parsed?.fee    != null) v.fee          = String(parsed.fee)
  if (parsed?.payoutDate)    v.payoutDate    = parsed.payoutDate
  if (parsed?.exDividendDate) v.exDividendDate = parsed.exDividendDate
  if (parsed?.dividendPerShare != null) v.dividendPerShare = String(parsed.dividendPerShare)
  if (parsed?.shareCount != null)       v.shareCount       = String(parsed.shareCount)
  if (parsed?.taxPercent != null)       v.taxPercent       = String(parsed.taxPercent)
  if (parsed?.stockExchange)  v.stockExchange  = parsed.stockExchange
  return v
}

// Attempt rollback: delete stock transactions and dividends by ID
function rollback(committed) {
  try {
    const txnKey = 'rmoney_stock_transactions'
    const divKey = 'rmoney_dividends'
    const buyIds = new Set(committed.filter(c => c.type !== 'dividend').map(c => c.id))
    const divIds = new Set(committed.filter(c => c.type === 'dividend').map(c => c.id))
    if (buyIds.size > 0) {
      const txns = JSON.parse(appStorage.getItem(txnKey)) ?? []
      appStorage.setItem(txnKey, JSON.stringify(txns.filter(t => !buyIds.has(t.id))))
    }
    if (divIds.size > 0) {
      const divs = JSON.parse(appStorage.getItem(divKey)) ?? []
      appStorage.setItem(divKey, JSON.stringify(divs.filter(d => !divIds.has(d.id))))
    }
  } catch {}
}
