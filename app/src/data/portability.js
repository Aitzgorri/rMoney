import { migrateDividendsArrayToV2 } from './dividends'
import { migrateStockProfilesArrayToV2 } from './stockProfiles'
import { migrateSettingsObjectToV2 } from './settings'
import appStorage from '../utils/appStorage'

const IS_TAURI = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

// Current backup format. Bumped to v2 in Phase 33 / Sub-phase 33n when the
// dividend status model + paysDividends + lastKnownPrice + favoriteCurrencies
// + apiCacheTtl + maximumFee fields landed. See SPEC-016 § "Backup format
// versioning + migration" for the v1→v2 delta list.
// v2→v3 (v0.35.0): adds the `dismissedSplits` collection (Phase 36d) and the
// stockTransactions fee-currency model — `feeCurrency`, currency-exchange linkage
// (`triggeredByStockTransactionId`, `linkedStockTransactionId`), and
// `exchangeRatesSnapshot` (Phase 35a), backfilled by the item-291 boot migration.
// v3→v4 (v0.36.0): adds the `settings.favoriteCountries` key (Phase 38 item 435).
// The key rides inside the existing `rmoney_settings` blob, so the delta is
// purely additive — older backups load and default the key on first use.
// v5 (SPEC-036): adds the rmoney_crypto_profiles collection (symbol→coin mappings) and crypto
// shapes inside rmoney_stock_transactions (assetClass/wallet, swap + wallet-transfer types,
// fee:{coin,quantity}). The delta is additive — older backups load and default the new bits
// (absent cryptoProfiles → []; transactions without assetClass are treated as stock).
const VERSION = 'rmoney-data-v5'

// Versions the loader can ingest. Newer code accepts older backups (v1–v4)
// and migrates them in-memory before writing v5-shape data to appStorage.
const ACCEPTED_VERSIONS = ['rmoney-data-v1', 'rmoney-data-v2', 'rmoney-data-v3', 'rmoney-data-v4', 'rmoney-data-v5']

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
  cryptoProfiles:     'rmoney_crypto_profiles',
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
  // Dismissed API-detected splits (Phase 36d) — user-curated; both backup modes.
  dismissedSplits:         'rmoney_dismissed_splits',
  // PERSISTED HISTORY — included in Full backup only; excluded from Sharable backup.
  apiDividendHistory: 'rmoney_api_dividend_history',
  // HOT CACHES (rmoney_market_data_cache, rmoney_market_data_log) — excluded from both backup modes.
}

function readList(key) {
  try { return JSON.parse(appStorage.getItem(key)) ?? [] } catch { return [] }
}

function readObj(key) {
  try { return JSON.parse(appStorage.getItem(key)) ?? {} } catch { return {} }
}

// Encodes a Uint8Array as a base64 string.
function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// Decodes a base64 string back to Uint8Array.
export function base64ToBytes(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// mode: 'sharable' (default) — excludes persisted-history collections (apiDividendHistory).
//        'full'              — includes persisted-history collections; use for full restore.
//                              When `strongholdVault` is provided (Tauri builds with a
//                              vault), the encrypted snapshot bytes are embedded
//                              base64-encoded under `_strongholdVault` per SPEC-031 § 241a.
// Neither mode includes hot caches (rmoney_market_data_cache, rmoney_market_data_log).
export function exportAppData({ mode = 'sharable', strongholdVault = null } = {}) {
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
    cryptoProfiles:     readList(KEYS.cryptoProfiles),
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
    dismissedSplits:         readList(KEYS.dismissedSplits),
  }
  if (mode === 'full') {
    base.apiDividendHistory = readList(KEYS.apiDividendHistory)
    if (strongholdVault instanceof Uint8Array && strongholdVault.length > 0) {
      base._strongholdVault = bytesToBase64(strongholdVault)
    }
  }
  return base
}

const REDACTED = '[REDACTED]'

// Returns a deep copy of data with all API keys and OAuth tokens replaced.
export function redactExportData(data) {
  const out = JSON.parse(JSON.stringify(data))
  out._redacted = true
  // Defense in depth: sharable mode should never carry the Stronghold vault.
  // exportAppData only sets it for mode='full', but strip again here so a caller
  // that hand-constructs a payload can't accidentally leak it.
  delete out._strongholdVault
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
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
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
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
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
  if (!parsed.version || typeof parsed.version !== 'string')
    return { ok: false, error: 'File is missing the version field.' }
  if (!ACCEPTED_VERSIONS.includes(parsed.version)) {
    // Distinguish future versions (rmoney-data-vN with N higher than current)
    // from totally unknown strings so the user gets actionable advice.
    const m = parsed.version.match(/^rmoney-data-v(\d+)$/)
    const currentN = Number(VERSION.match(/^rmoney-data-v(\d+)$/)[1])
    if (m && Number(m[1]) > currentN) {
      return { ok: false, error: 'This backup was saved by a newer version of rMoney. Update the app to load it.' }
    }
    return { ok: false, error: `Unknown file version "${parsed.version}".` }
  }
  if (!parsed.exportedAt)
    return { ok: false, error: 'File is missing the exportedAt timestamp.' }
  for (const key of ['accounts', 'transactions', 'categories', 'envelopes', 'settings']) {
    if (!(key in parsed))
      return { ok: false, error: `File is missing required field: "${key}".` }
  }
  return { ok: true }
}

// Apply v1→v2 transforms to an in-memory backup payload before it's written
// to appStorage. The boot-time migrations (migrateDividendStatuses,
// migrateConfirmedField, migrateFavoriteCurrencies) would otherwise refuse to
// re-run on top of imported v1 data because their per-key flags are already
// set on the destination install. Applying the same pure transforms here
// guarantees that appStorage ends up in v2 shape regardless of source.
// The v2→v3 delta (dismissedSplits collection + stockTransactions fee-currency
// fields) is additive: importAppData defaults the new collection and the
// item-291 boot migration backfills feeCurrency, so no explicit v2→v3 branch is
// needed — a v2 payload is written as-is and upgraded to v3 shape on next boot.
export function migrateBackup(parsed) {
  if (parsed.version === VERSION) return parsed
  if (parsed.version === 'rmoney-data-v1') {
    // v1 chains through the v2 transforms; the v2→v3 delta is additive (handled
    // below) so the payload is labelled v3 directly.
    return {
      ...parsed,
      version: VERSION,
      dividends:     migrateDividendsArrayToV2(parsed.dividends     ?? []),
      stockProfiles: migrateStockProfilesArrayToV2(parsed.stockProfiles ?? []),
      settings:      migrateSettingsObjectToV2(parsed.settings       ?? {}),
    }
  }
  if (parsed.version === 'rmoney-data-v2' || parsed.version === 'rmoney-data-v3') {
    // v2→v3 (dismissedSplits + stockTransactions fee-currency fields) and
    // v3→v4 (settings.favoriteCountries) are both purely additive: importAppData
    // defaults the new collection, the item-291 boot migration backfills
    // feeCurrency, and favoriteCountries defaults on first use. No field
    // transforms are needed here — just relabel so the payload is v4 shape.
    return { ...parsed, version: VERSION }
  }
  return parsed
}

export function importAppData(data) {
  data = migrateBackup(data)
  function write(key, value) { appStorage.setItem(key, JSON.stringify(value)) }

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
  write(KEYS.cryptoProfiles,       data.cryptoProfiles       ?? [])
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
  write(KEYS.dismissedSplits,           data.dismissedSplits           ?? [])
  // Persisted history — present only in Full backups; absent key means keep existing data
  if ('apiDividendHistory' in data) {
    write(KEYS.apiDividendHistory, data.apiDividendHistory ?? [])
  }
}
