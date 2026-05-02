// ─── CSV text parsing ─────────────────────────────────────────────────────────

// Infers the delimiter by counting candidates in the first non-empty line.
// Returns ',' | ';' | '\t'.
export function detectDelimiter(text) {
  const firstLine = (text.split('\n')[0] ?? '').replace(/\r/g, '')
  const commas = (firstLine.match(/,/g)  ?? []).length
  const semis  = (firstLine.match(/;/g)  ?? []).length
  const tabs   = (firstLine.match(/\t/g) ?? []).length
  if (tabs > commas && tabs > semis) return '\t'
  if (semis > commas) return ';'
  return ','
}

// Parses a CSV text string into a 2D array of strings (rows × columns).
// Handles quoted fields (including embedded commas/semis and newlines), CRLF,
// and doubled-quote escapes inside quoted fields.
// delimiter defaults to ',' but callers should pass the detected value.
export function parseCSVText(text, delimiter = ',') {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\r') continue
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === delimiter) {
        row.push(field); field = ''
      } else if (c === '\n') {
        row.push(field); field = ''
        if (row.some(f => f !== '')) rows.push(row)
        row = []
      } else {
        field += c
      }
    }
  }
  // Final field / row
  row.push(field)
  if (row.some(f => f !== '')) rows.push(row)

  return rows
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

export const DATE_FORMATS = [
  'YYYY-MM-DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'DD.MM.YYYY',
  'YYYY/MM/DD',
  'DD-MM-YYYY',
  'MM-DD-YYYY',
]

export function parseDate(str, format) {
  const s = (str ?? '').trim()
  if (!s) return null

  let y, m, d

  if (format === 'YYYY-MM-DD') {
    const r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (!r) return null;  [, y, m, d] = r
  } else if (format === 'DD/MM/YYYY') {
    const r = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (!r) return null;  [, d, m, y] = r
  } else if (format === 'MM/DD/YYYY') {
    const r = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (!r) return null;  [, m, d, y] = r
  } else if (format === 'DD.MM.YYYY') {
    const r = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
    if (!r) return null;  [, d, m, y] = r
  } else if (format === 'YYYY/MM/DD') {
    const r = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/)
    if (!r) return null;  [, y, m, d] = r
  } else if (format === 'DD-MM-YYYY') {
    const r = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/)
    if (!r) return null;  [, d, m, y] = r
  } else if (format === 'MM-DD-YYYY') {
    const r = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/)
    if (!r) return null;  [, m, d, y] = r
  } else {
    return null
  }

  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const dt = new Date(iso)
  return isNaN(dt.getTime()) ? null : iso
}

// Detect the date format by trying each known format against a small sample of values.
// Returns the first matching format string, or null if none match.
export function detectDateFormat(sampleValues) {
  for (const raw of sampleValues) {
    const v = (raw ?? '').trim()
    if (!v) continue
    for (const fmt of DATE_FORMATS) {
      if (parseDate(v, fmt) !== null) return fmt
    }
    break  // Stop at first non-empty, non-matching value to avoid false positives
  }
  return null
}

// ─── Number parsing ───────────────────────────────────────────────────────────

export function parseNumber(str, decimalSeparator = '.') {
  if (str == null) return null
  let s = String(str).trim()
  if (!s) return null
  // Strip thousands separator (opposite of decimal)
  const thousands = decimalSeparator === '.' ? ',' : '.'
  s = s.replace(new RegExp(`\\${thousands}`, 'g'), '')
  s = s.replace(decimalSeparator, '.')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

// ─── App fields ───────────────────────────────────────────────────────────────

export const APP_FIELDS = [
  { value: '__ignore__', label: '— ignore —' },
  { value: 'date',                   label: 'Date' },
  { value: 'type',                   label: 'Type (buy/sell/dividend)' },
  { value: 'ticker',                 label: 'Ticker / symbol' },
  { value: 'shares',                 label: 'Shares / quantity' },
  { value: 'price',                  label: 'Price per share' },
  { value: 'currency',               label: 'Currency' },
  { value: 'stockExchange',          label: 'Stock exchange (optional)' },
  { value: 'fee',                    label: 'Fee / commission (optional)' },
  { value: 'transactionExternalId',  label: 'Transaction ID for dedup (optional)' },
  { value: 'dividendPerShare',       label: 'Dividend per share' },
  { value: 'shareCount',             label: 'Share count (dividend)' },
  { value: 'exDividendDate',         label: 'Ex-dividend date' },
  { value: 'payoutDate',             label: 'Payout date (dividend)' },
  { value: 'taxPercent',             label: 'Tax % (dividend, optional)' },
]

export const APP_TYPES = ['buy', 'sell', 'dividend', 'transfer']

// ─── Mapping application ──────────────────────────────────────────────────────

// Apply a column mapping to CSV rows. Returns an array of raw app-field objects.
// rows[0] must be the header row.
export function applyMapping(rows, mapping, defaultType, typeValueMap) {
  const [headers, ...dataRows] = rows
  return dataRows
    .map((row, idx) => {
      const obj = { _rowIndex: idx + 2 }  // 1-based, header = row 1
      for (let i = 0; i < headers.length; i++) {
        const appField = mapping[headers[i]]
        if (!appField || appField === '__ignore__') continue
        obj[appField] = (row[i] ?? '').trim()
      }
      // Resolve type
      if (obj.type && typeValueMap) {
        const key = Object.keys(typeValueMap).find(k => k.toLowerCase() === obj.type.toLowerCase())
        if (key) obj.type = typeValueMap[key]
      }
      if (!obj.type && defaultType) obj.type = defaultType
      return obj
    })
    .filter(obj => {
      // Skip rows where every mapped value is empty
      const vals = Object.entries(obj).filter(([k]) => !k.startsWith('_')).map(([, v]) => v)
      return vals.some(v => v !== '')
    })
}

// ─── Row validation ───────────────────────────────────────────────────────────

// Validates a single mapped row. Returns { errors: string[], parsed: object }.
export function validateRow(obj, dateFormat, decimalSeparator) {
  const errors = []
  const parsed = { _rowIndex: obj._rowIndex }

  const type = obj.type?.trim().toLowerCase()
  if (!type) {
    errors.push('Missing transaction type')
  } else if (!APP_TYPES.includes(type)) {
    errors.push(`Unknown type "${obj.type}" — expected buy, sell, dividend, or transfer`)
  }
  parsed.type = type

  // Ticker
  if (!obj.ticker?.trim()) errors.push('Missing ticker')
  else parsed.ticker = obj.ticker.trim().toUpperCase()

  // Currency
  if (!obj.currency?.trim()) errors.push('Missing currency')
  else parsed.currency = obj.currency.trim().toUpperCase()

  if (type === 'buy' || type === 'sell') {
    const date = parseDate(obj.date, dateFormat)
    if (!date) errors.push(`Invalid date "${obj.date}"`)
    else parsed.date = date

    const shares = parseNumber(obj.shares, decimalSeparator)
    if (shares == null || shares <= 0) errors.push('Missing or invalid shares (must be > 0)')
    else parsed.shares = shares

    const price = parseNumber(obj.price, decimalSeparator)
    if (price == null || price < 0) errors.push('Missing or invalid price')
    else parsed.price = price

    parsed.fee = parseNumber(obj.fee, decimalSeparator) ?? 0
    parsed.stockExchange = obj.stockExchange?.trim() || null
    parsed.transactionExternalId = obj.transactionExternalId?.trim() || null

  } else if (type === 'dividend') {
    const pd = parseDate(obj.payoutDate || obj.date, dateFormat)
    if (!pd) errors.push('Missing or invalid payout date')
    else {
      parsed.payoutDate = pd
      parsed.exDividendDate = parseDate(obj.exDividendDate, dateFormat) || pd
    }

    const dps = parseNumber(obj.dividendPerShare, decimalSeparator)
    if (dps == null || dps < 0) errors.push('Missing or invalid dividend per share')
    else parsed.dividendPerShare = dps

    const sc = parseNumber(obj.shareCount, decimalSeparator)
    if (sc == null || sc <= 0) errors.push('Missing or invalid share count (must be > 0)')
    else parsed.shareCount = sc

    parsed.taxPercent = parseNumber(obj.taxPercent, decimalSeparator) ?? 0
    parsed.transactionExternalId = obj.transactionExternalId?.trim() || null

  } else if (type === 'transfer') {
    // Transfer: same required fields as buy/sell
    const date = parseDate(obj.date, dateFormat)
    if (!date) errors.push(`Invalid date "${obj.date}"`)
    else parsed.date = date

    const shares = parseNumber(obj.shares, decimalSeparator)
    if (shares == null || shares <= 0) errors.push('Missing or invalid shares')
    else parsed.shares = shares

    parsed.transactionExternalId = obj.transactionExternalId?.trim() || null
  }

  return { errors, parsed }
}

// Detect unique type-column values for the type-value-map UI
export function detectTypeValues(rows, typeColumnName) {
  const [headers, ...dataRows] = rows
  const idx = headers.indexOf(typeColumnName)
  if (idx < 0) return []
  const values = new Set()
  for (const row of dataRows) {
    const v = (row[idx] ?? '').trim()
    if (v) values.add(v)
  }
  return [...values].sort()
}
