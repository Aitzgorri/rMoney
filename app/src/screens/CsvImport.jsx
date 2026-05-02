import { useState, useRef } from 'react'
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
import { fmtAmt } from '../utils/format'
import styles from './CsvImport.module.css'

// ─── CsvImport — multi-step wizard ───────────────────────────────────────────

export default function CsvImport({ accountId, onBack }) {
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
    const toImport = validated.filter(r => !skipped.has(r.rowIndex) && r.errors.length === 0)

    // Collect existing external IDs to detect duplicates
    const existingExtIds = collectExternalIds(accountId)

    const committed = []
    let dupCount = 0
    let errCount = 0

    for (const row of toImport) {
      const p = row.parsed
      const extId = p.transactionExternalId
      if (extId && existingExtIds.has(extId)) { dupCount++; continue }

      try {
        if (p.type === 'buy') {
          const rec = createBuy({
            investingAccountId: accountId,
            date: p.date, ticker: p.ticker, stockExchange: p.stockExchange,
            shares: p.shares, price: p.price, currency: p.currency,
            fee: p.fee, transactionExternalId: extId,
          })
          committed.push({ type: 'buy', id: rec.id })
        } else if (p.type === 'sell') {
          const rec = createSell({
            investingAccountId: accountId,
            date: p.date, ticker: p.ticker, stockExchange: p.stockExchange,
            shares: p.shares, price: p.price, currency: p.currency,
            fee: p.fee, transactionExternalId: extId,
          })
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
          committed.push({ type: 'dividend', id: rec.id })
        } else {
          // 'transfer' — skipped in phase 2 (requires destination account)
          dupCount++
        }
      } catch (e) {
        // Rollback: delete everything committed so far
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
      if (setAsDefault) {
        updateInvestingAccount(accountId, { defaultCsvTemplateId: newTpl.id })
      }
    } else if (setAsDefault && templateId) {
      updateInvestingAccount(accountId, { defaultCsvTemplateId: templateId })
    }

    const totalSkipped = skipped.size + dupCount
    setResult({ imported: committed.length, skipped: totalSkipped, dups: dupCount, errors: errCount })
    setStep('done')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <div className={styles.screen}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={onBack}>←</button>
          <h1 className={styles.title}>Import complete</h1>
        </div>
        <div className={styles.doneCard}>
          {result.error ? (
            <>
              <div className={styles.doneTitle}>Import failed</div>
              <div className={`${styles.doneStat} ${styles.doneStatErr}`}>{result.error}</div>
            </>
          ) : (
            <>
              <div className={styles.doneTitle}>Done</div>
              <div className={`${styles.doneStat} ${styles.doneStatGood}`}>
                <strong>{result.imported}</strong> record{result.imported !== 1 ? 's' : ''} imported
              </div>
              {result.dups > 0 && (
                <div className={`${styles.doneStat} ${styles.doneStatWarn}`}>
                  <strong>{result.dups}</strong> duplicate{result.dups !== 1 ? 's' : ''} skipped (matching external ID)
                </div>
              )}
              {result.skipped - result.dups > 0 && (
                <div className={`${styles.doneStat} ${styles.doneStatWarn}`}>
                  <strong>{result.skipped - result.dups}</strong> row{result.skipped - result.dups !== 1 ? 's' : ''} skipped
                </div>
              )}
            </>
          )}
          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={onBack}>Close</button>
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

// Collect all existing transactionExternalId values for dedup
function collectExternalIds(investingAccountId) {
  const ids = new Set()
  try {
    const txns = JSON.parse(localStorage.getItem('rmoney_stock_transactions')) ?? []
    txns.filter(t => t.investingAccountId === investingAccountId && t.transactionExternalId)
        .forEach(t => ids.add(t.transactionExternalId))
    const divs = JSON.parse(localStorage.getItem('rmoney_dividends')) ?? []
    divs.filter(d => d.investingAccountId === investingAccountId && d.transactionExternalId)
        .forEach(d => ids.add(d.transactionExternalId))
  } catch {}
  return ids
}

// Attempt rollback: delete stock transactions and dividends by ID
function rollback(committed) {
  try {
    const txnKey = 'rmoney_stock_transactions'
    const divKey = 'rmoney_dividends'
    const buyIds = new Set(committed.filter(c => c.type !== 'dividend').map(c => c.id))
    const divIds = new Set(committed.filter(c => c.type === 'dividend').map(c => c.id))
    if (buyIds.size > 0) {
      const txns = JSON.parse(localStorage.getItem(txnKey)) ?? []
      localStorage.setItem(txnKey, JSON.stringify(txns.filter(t => !buyIds.has(t.id))))
    }
    if (divIds.size > 0) {
      const divs = JSON.parse(localStorage.getItem(divKey)) ?? []
      localStorage.setItem(divKey, JSON.stringify(divs.filter(d => !divIds.has(d.id))))
    }
  } catch {}
}
