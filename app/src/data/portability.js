import { save, open } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'

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
}

function readList(key) {
  try { return JSON.parse(localStorage.getItem(key)) ?? [] } catch { return [] }
}

function readObj(key) {
  try { return JSON.parse(localStorage.getItem(key)) ?? {} } catch { return {} }
}

export function exportAppData() {
  return {
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
  }
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

// Opens a native Save As dialog. Returns the saved filename, or null if cancelled.
export async function saveDataFile(data) {
  const date = new Date().toISOString().slice(0, 10)
  const path = await save({
    defaultPath: `rmoney-backup-${date}.rmy`,
    filters: [{ name: 'rMoney Backup', extensions: ['rmy'] }],
  })
  if (!path) return null
  await writeTextFile(path, JSON.stringify(data, null, 2))
  // Return just the filename portion for the banner
  return path.split(/[\\/]/).pop()
}

// Opens a native Open dialog, reads the file, and validates it.
// Returns { data, filename, exportedAt } on success, or { error } on failure, or null if cancelled.
export async function openDataFile() {
  const path = await open({
    filters: [{ name: 'rMoney Backup', extensions: ['rmy', 'json'] }],
    multiple: false,
  })
  if (!path) return null

  let text
  try {
    text = await readTextFile(path)
  } catch {
    return { error: 'Could not read the file.' }
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
  const filename = path.split(/[\\/]/).pop()
  return { data: parsed, filename, exportedAt }
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
}
