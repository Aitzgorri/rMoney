const IS_TAURI = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

const VERSION = 'rmoney-data-v1'

const KEYS = {
  accounts:           'rmoney_accounts',
  transactions:       'rmoney_transactions',
  payees:             'rmoney_payees',
  recurringRules:     'rmoney_recurring',
  envelopes:          'rmoney_envelopes',
  envelopeTransfers:  'rmoney_envelope_transfers',
  scheduledTransfers: 'rmoney_envelope_scheduled',
  categories:         'rmoney_categories',
  categoryDefaults:   'rmoney_default_categories',
  plannedIncomes:     'rmoney_planned_incomes',
  plannedExpenses:    'rmoney_planned_expenses',
  budgets:            'rmoney_budgets',
  billsAndIncome:     'rmoney_bill_items',
  billsPending:       'rmoney_bill_pending',
  settings:           'rmoney_settings',
  widgets:            'rmoney_widgets',
  investingAccounts:  'rmoney_investing_accounts',
  cashBalances:       'rmoney_cash_balances',
  cashMovements:      'rmoney_cash_movements',
  stockTransactions:  'rmoney_stock_transactions',
  dividends:          'rmoney_dividends',
  stockProfiles:      'rmoney_stock_profiles',
  portfolios:         'rmoney_portfolios',
  portfolioAssignments: 'rmoney_portfolio_assignments',
  csvTemplates:       'rmoney_csv_templates',
  aiSystemPrompts:    'rmoney_ai_system_prompts',
  aiChats:            'rmoney_ai_chats',
  watchlists:            'rmoney_watchlists',
  watchlistEntries:      'rmoney_watchlist_entries',
  watchlistAlerts:       'rmoney_watchlist_alerts',
  investmentReportPresets: 'rmoney_investment_report_presets',
  pieChartPresets:         'rmoney_pie_chart_presets',
  // User-entered prices for manual stocks (Phase 32e) — included in both backup modes.
  manualPrices:            'rmoney_manual_prices',
  // Buy-Sell Planning scenarios (Phase 32g) — included in both backup modes.
  tradingScenarios:        'rmoney_trading_scenarios',
  // PERSISTED HISTORY — included in Full backup only; excluded from Sharable backup.
  apiDividendHistory: 'rmoney_api_dividend_history',
  // HOT CACHES (rmoney_market_data_cache, rmoney_market_data_log) — excluded from both backup modes.
}

function readList(key) {
  try { return JSON.parse(localStorage.getItem(key)) ?? [] } catch { return [] }
}

function readObj(key) {
  try { return JSON.parse(localStorage.getItem(key)) ?? {} } catch { return {} }
}

// mode: 'sharable' (default) — excludes persisted-history collections (apiDividendHistory).
//        'full'              — includes persisted-history collections; use for full restore.
// Neither mode includes hot caches (rmoney_market_data_cache, rmoney_market_data_log).
export function exportAppData({ mode = 'sharable' } = {}) {
  const base = {
    version: VERSION,
    exportedAt: new Date().toISOString(),
    accounts:           readList(KEYS.accounts),
    transactions:       readList(KEYS.transactions),
    payees:             readList(KEYS.payees),
    recurringRules:     readList(KEYS.recurringRules),
    envelopes:          readList(KEYS.envelopes),
    envelopeTransfers:  readList(KEYS.envelopeTransfers),
    scheduledTransfers: readList(KEYS.scheduledTransfers),
    categories:         readList(KEYS.categories),
    categoryDefaults:   readObj(KEYS.categoryDefaults),
    plannedIncomes:     readList(KEYS.plannedIncomes),
    plannedExpenses:    readList(KEYS.plannedExpenses),
    budgets:            readList(KEYS.budgets),
    billsAndIncome:     readList(KEYS.billsAndIncome),
    billsPending:       readList(KEYS.billsPending),
    settings:           readObj(KEYS.settings),
    widgets:            readList(KEYS.widgets),
    investingAccounts:  readList(KEYS.investingAccounts),
    cashBalances:       readList(KEYS.cashBalances),
    cashMovements:      readList(KEYS.cashMovements),
    stockTransactions:  readList(KEYS.stockTransactions),
    dividends:          readList(KEYS.dividends),
    stockProfiles:      readList(KEYS.stockProfiles),
    portfolios:         readList(KEYS.portfolios),
    portfolioAssignments: readList(KEYS.portfolioAssignments),
    csvTemplates:       readList(KEYS.csvTemplates),
    aiSystemPrompts:    readList(KEYS.aiSystemPrompts),
    aiChats:            readObj(KEYS.aiChats),
    watchlists:              readList(KEYS.watchlists),
    watchlistEntries:        readList(KEYS.watchlistEntries),
    watchlistAlerts:         readList(KEYS.watchlistAlerts),
    investmentReportPresets: readList(KEYS.investmentReportPresets),
    pieChartPresets:         readList(KEYS.pieChartPresets),
    manualPrices:            readList(KEYS.manualPrices),
    tradingScenarios:        readList(KEYS.tradingScenarios),
  }
  if (mode === 'full') {
    base.apiDividendHistory = readList(KEYS.apiDividendHistory)
  }
  return base
}

const REDACTED = '[REDACTED]'

// Returns a deep copy of data with all API keys and OAuth tokens replaced.
export function redactExportData(data) {
  const out = JSON.parse(JSON.stringify(data))
  out._redacted = true
  const s = out.settings
  if (!s) return out
  if (s.aiConnection?.apiKey) s.aiConnection.apiKey = REDACTED
  const mp = s.marketDataProviders
  if (mp) {
    for (const id of ['massive', 'twelveData', 'finnhub', 'alphaVantage']) {
      if (mp[id]?.apiKey) mp[id].apiKey = REDACTED
    }
    if (mp.ibkr?.oauth) {
      if (mp.ibkr.oauth.accessToken) mp.ibkr.oauth.accessToken = REDACTED
      if (mp.ibkr.oauth.refreshToken) mp.ibkr.oauth.refreshToken = REDACTED
    }
  }
  return out
}

function stripCredentials(settings) {
  const s = JSON.parse(JSON.stringify(settings))
  if (s.aiConnection) delete s.aiConnection.apiKey
  const mp = s.marketDataProviders
  if (mp) {
    for (const id of ['massive', 'twelveData', 'finnhub', 'alphaVantage']) {
      if (mp[id]) delete mp[id].apiKey
    }
    if (mp.ibkr?.oauth) {
      delete mp.ibkr.oauth.accessToken
      delete mp.ibkr.oauth.refreshToken
    }
  }
  return s
}

// Saves data to a file. Returns the saved filename, or null if cancelled.
// • Tauri: native Save-As dialog → writeTextFile
// • Capacitor: @capacitor/filesystem → Documents directory (app-scoped external storage)
// • Browser fallback: blob download via <a> element
export async function saveDataFile(data) {
  const json = JSON.stringify(data, null, 2)
  const date = new Date().toISOString().slice(0, 10)
  const defaultName = `rmoney-backup-${date}.rmy`

  if (IS_TAURI) {
    const { save } = await import(/* @vite-ignore */ '@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import(/* @vite-ignore */ '@tauri-apps/plugin-fs')
    const path = await save({
      defaultPath: defaultName,
      filters: [{ name: 'rMoney Backup', extensions: ['rmy'] }],
    })
    if (!path) return null
    await writeTextFile(path, json)
    return path.split(/[\\/]/).pop()
  }

  if (typeof window !== 'undefined' && window.Capacitor) {
    // Use the Web Share API so the user can pick their destination (Drive, Files, etc.).
    // Falls back to writing to the app-scoped Documents dir if sharing isn't available.
    const blob = new Blob([json], { type: 'application/octet-stream' })
    const file = new File([blob], defaultName, { type: 'application/octet-stream' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'rMoney Backup' })
      } catch (err) {
        if (err.name === 'AbortError') return null  // user cancelled the share sheet
        throw err
      }
      return defaultName
    }
    // Fallback: app-scoped Documents dir (hidden on Android 11+ but always writable)
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const result = await Filesystem.writeFile({
      path: defaultName,
      data: json,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
    return result?.uri ?? defaultName
  }

  // Browser fallback: trigger a download
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = defaultName
  a.click()
  URL.revokeObjectURL(url)
  return defaultName
}

// Reads and validates a backup file. Returns { data, filename, exportedAt }, { error }, or null (cancelled).
// • Tauri: native Open dialog → readTextFile
// • Capacitor + browser: <input type="file"> picker → FileReader
export async function openDataFile() {
  let text, filename

  if (IS_TAURI) {
    const { open } = await import(/* @vite-ignore */ '@tauri-apps/plugin-dialog')
    const { readTextFile } = await import(/* @vite-ignore */ '@tauri-apps/plugin-fs')
    const path = await open({
      filters: [{ name: 'rMoney Backup', extensions: ['rmy', 'json'] }],
      multiple: false,
    })
    if (!path) return null
    try {
      text = await readTextFile(path)
    } catch {
      return { error: 'Could not read the file.' }
    }
    filename = path.split(/[\\/]/).pop()
  } else {
    const picked = await pickFileViaInput()
    if (!picked) return null
    if (picked.error) return picked
    text = picked.text
    filename = picked.filename
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: 'The file does not appear to be valid JSON.' }
  }

  const result = validateImportData(parsed)
  if (!result.ok) return { error: result.error }

  const exportedAt = new Date(parsed.exportedAt).toLocaleString(
    undefined, { dateStyle: 'medium', timeStyle: 'short' }
  )
  return { data: parsed, filename, exportedAt }
}

function pickFileViaInput() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    // On Android the SAF picker greys out `.rmy` files because the extension has
    // no registered MIME type. Accept any file on Capacitor and validate after read.
    const isCapacitor = typeof window !== 'undefined' && !!window.Capacitor
    input.accept = isCapacitor ? '*/*' : '.rmy,.json'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) { resolve(null); return }
      try {
        const text = await file.text()
        resolve({ text, filename: file.name })
      } catch {
        resolve({ error: 'Could not read the file.' })
      }
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

// Returns { ok: true } or { ok: false, error: string }
export function validateImportData(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return { ok: false, error: 'File is not a valid JSON object.' }
  if (parsed.version !== VERSION)
    return { ok: false, error: `Unknown file version "${parsed.version}". Expected "${VERSION}".` }
  if (!parsed.exportedAt)
    return { ok: false, error: 'File is missing the exportedAt timestamp.' }
  for (const key of ['accounts', 'transactions', 'categories', 'envelopes', 'settings']) {
    if (!(key in parsed))
      return { ok: false, error: `File is missing required field: "${key}".` }
  }
  return { ok: true }
}

export function importAppData(data) {
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)) }

  write(KEYS.accounts,           data.accounts           ?? [])
  write(KEYS.transactions,       data.transactions       ?? [])
  write(KEYS.payees,             data.payees             ?? [])
  write(KEYS.recurringRules,     data.recurringRules     ?? [])
  write(KEYS.envelopes,          data.envelopes          ?? [])
  write(KEYS.envelopeTransfers,  data.envelopeTransfers  ?? [])
  write(KEYS.scheduledTransfers, data.scheduledTransfers ?? [])
  write(KEYS.categories,         data.categories         ?? [])
  write(KEYS.categoryDefaults,   data.categoryDefaults   ?? {})
  write(KEYS.plannedIncomes,     data.plannedIncomes     ?? [])
  write(KEYS.plannedExpenses,    data.plannedExpenses    ?? [])
  write(KEYS.budgets,            data.budgets            ?? [])
  write(KEYS.billsAndIncome,     data.billsAndIncome     ?? [])
  write(KEYS.billsPending,       data.billsPending       ?? [])
  write(KEYS.settings, data._redacted ? stripCredentials(data.settings ?? {}) : (data.settings ?? {}))
  write(KEYS.widgets,            data.widgets            ?? [])
  write(KEYS.investingAccounts,  data.investingAccounts  ?? [])
  write(KEYS.cashBalances,       data.cashBalances       ?? [])
  write(KEYS.cashMovements,      data.cashMovements      ?? [])
  write(KEYS.stockTransactions,  data.stockTransactions  ?? [])
  write(KEYS.dividends,            data.dividends            ?? [])
  write(KEYS.stockProfiles,        data.stockProfiles        ?? [])
  write(KEYS.portfolios,           data.portfolios           ?? [])
  write(KEYS.portfolioAssignments, data.portfolioAssignments ?? [])
  write(KEYS.csvTemplates,         data.csvTemplates         ?? [])
  write(KEYS.aiSystemPrompts,      data.aiSystemPrompts      ?? [])
  write(KEYS.aiChats,              data.aiChats              ?? {})
  write(KEYS.watchlists,               data.watchlists               ?? [])
  write(KEYS.watchlistEntries,         data.watchlistEntries         ?? [])
  write(KEYS.watchlistAlerts,          data.watchlistAlerts          ?? [])
  write(KEYS.investmentReportPresets,  data.investmentReportPresets  ?? [])
  write(KEYS.pieChartPresets,           data.pieChartPresets           ?? [])
  write(KEYS.manualPrices,              data.manualPrices              ?? [])
  write(KEYS.tradingScenarios,          data.tradingScenarios          ?? [])
  // Persisted history — present only in Full backups; absent key means keep existing data
  if ('apiDividendHistory' in data) {
    write(KEYS.apiDividendHistory, data.apiDividendHistory ?? [])
  }
}
