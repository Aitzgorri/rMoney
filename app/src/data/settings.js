import { inferLocaleCurrency } from '../utils/currency'
import appStorage from '../utils/appStorage'

const KEY = 'rmoney_settings'

function load() {
  try {
    return JSON.parse(appStorage.getItem(KEY)) ?? {}
  } catch {
    return {}
  }
}

function save(settings) {
  appStorage.setItem(KEY, JSON.stringify(settings))
}

export function getSetting(key, defaultValue) {
  return load()[key] ?? defaultValue
}

export function setSetting(key, value) {
  const settings = load()
  save({ ...settings, [key]: value })
}

// Convenience for planning period start day (1-28, default 1)
export function getPlanningStartDay() {
  return getSetting('planningPeriodStartDay', 1)
}

export function setPlanningStartDay(day) {
  setSetting('planningPeriodStartDay', Number(day))
}

// ─── Currency ────────────────────────────────────────────────────────────────

export function getMainCurrency() {
  return getSetting('mainCurrency', null) ?? inferLocaleCurrency()
}

export function setMainCurrency(code) {
  setSetting('mainCurrency', code)
}

// 'main' | 'native'  — default display mode for cross-currency totals
export function getCurrencyDisplay() {
  return getSetting('currencyDisplay', 'main')
}

export function setCurrencyDisplay(mode) {
  setSetting('currencyDisplay', mode)
}

// Default favorites seeds (Phase 38). The favorites lists start small and the
// user grows them; the full ISO lists remain available in the "others" section
// of every dropdown. `SUPPORTED_CURRENCIES` (utils/currency) is unchanged — only
// the favorites *seed* shrank from 14 codes to these four.
export const DEFAULT_FAVORITE_CURRENCIES = ['GBP', 'EUR', 'CAD', 'USD']
export const DEFAULT_FAVORITE_COUNTRIES  = ['US', 'GB', 'DE', 'CA']

// Ordered list of ISO 4217 codes the user considers "favorites".
// Shown at the top of every CurrencyDropdown, in user-defined order.
export function getFavoriteCurrencies() {
  return getSetting('favoriteCurrencies', null) ?? [...DEFAULT_FAVORITE_CURRENCIES]
}

export function setFavoriteCurrencies(codes) {
  setSetting('favoriteCurrencies', codes)
}

// Ordered list of ISO 3166-1 alpha-2 codes the user considers "favorites".
// Shown at the top of every CountryDropdown, in user-defined order (Phase 38).
export function getFavoriteCountries() {
  return getSetting('favoriteCountries', null) ?? [...DEFAULT_FAVORITE_COUNTRIES]
}

export function setFavoriteCountries(codes) {
  setSetting('favoriteCountries', codes)
}

// Pure transform — seeds `favoriteCurrencies` and `favoriteCountries` on a
// settings object that lacks either. Used by both the boot-time wrappers below
// AND the backup loader. Each field is seeded independently so an object that
// already has one still picks up the other.
export function migrateSettingsObjectToV2(settings) {
  let next = settings ?? {}
  if (!Array.isArray(next.favoriteCurrencies)) {
    next = { ...next, favoriteCurrencies: [...DEFAULT_FAVORITE_CURRENCIES] }
  }
  if (!Array.isArray(next.favoriteCountries)) {
    next = { ...next, favoriteCountries: [...DEFAULT_FAVORITE_COUNTRIES] }
  }
  return next
}

// One-shot boot migration: seed favoriteCurrencies when the setting is absent.
export function migrateFavoriteCurrencies() {
  const raw = load()
  if (!Array.isArray(raw.favoriteCurrencies)) {
    save(migrateSettingsObjectToV2(raw))
  }
}

// One-shot boot migration: seed favoriteCountries when the setting is absent (Phase 38).
export function migrateFavoriteCountries() {
  const raw = load()
  if (!Array.isArray(raw.favoriteCountries)) {
    save(migrateSettingsObjectToV2(raw))
  }
}

// ─── Favorite accounts / categories / envelopes (Phase 48) ───────────────────
//
// Ordered lists of entity IDs the user pins to the top of the relevant pickers
// (and, for accounts, the Dashboard balances list). Unlike favorite currencies /
// countries these seed EMPTY — a favorite account is user-specific, there is no
// sensible default — so no boot migration is needed: the getters default to []
// when the key is absent, and the keys ride inside the existing `rmoney_settings`
// blob (already exported/imported by SPEC-016, so no backup-format change).

export function getFavoriteAccounts() {
  return getSetting('favoriteAccounts', null) ?? []
}

export function setFavoriteAccounts(ids) {
  setSetting('favoriteAccounts', ids)
}

// Categories are strictly split into income and expense trees (SPEC-003), so
// favorite categories are kept as two independent ordered lists — the type-
// filtered category pickers (Phase 51) each read only their own type's list.
export function getFavoriteIncomeCategories() {
  return getSetting('favoriteIncomeCategories', null) ?? []
}

export function setFavoriteIncomeCategories(ids) {
  setSetting('favoriteIncomeCategories', ids)
}

export function getFavoriteExpenseCategories() {
  return getSetting('favoriteExpenseCategories', null) ?? []
}

export function setFavoriteExpenseCategories(ids) {
  setSetting('favoriteExpenseCategories', ids)
}

export function getFavoriteEnvelopes() {
  return getSetting('favoriteEnvelopes', null) ?? []
}

export function setFavoriteEnvelopes(ids) {
  setSetting('favoriteEnvelopes', ids)
}

// ─── CSV import defaults ─────────────────────────────────────────────────────

export function getDefaultCsvDateFormat() {
  return getSetting('csvDefaultDateFormat', 'YYYY-MM-DD')
}

export function setDefaultCsvDateFormat(format) {
  setSetting('csvDefaultDateFormat', format)
}

// ─── Dividends ───────────────────────────────────────────────────────────────

export function getDividendDefaultTaxPercent() {
  return getSetting('dividends', {}).defaultTaxPercent ?? 0
}

export function setDividendDefaultTaxPercent(percent) {
  const existing = getSetting('dividends', {})
  setSetting('dividends', { ...existing, defaultTaxPercent: Number(percent) })
}

export function getDividendEstimationRule() {
  return getSetting('dividends', {}).defaultAmountEstimationRule ?? 'last-paid'
}

export function setDividendEstimationRule(rule) {
  const existing = getSetting('dividends', {})
  setSetting('dividends', { ...existing, defaultAmountEstimationRule: rule })
}

export function getPerCountryDividendTax() {
  return getSetting('dividends', {}).perCountryTaxPercent ?? {}
}

export function setPerCountryDividendTax(map) {
  const existing = getSetting('dividends', {})
  setSetting('dividends', { ...existing, perCountryTaxPercent: map })
}

export function getConfirmReceipt() {
  return getSetting('dividends', {}).confirmReceipt ?? false
}

export function setConfirmReceipt(value) {
  const existing = getSetting('dividends', {})
  setSetting('dividends', { ...existing, confirmReceipt: !!value })
}

// ─── AI Evaluation ───────────────────────────────────────────────────────────

export function getAiConnection() {
  const conn = getSetting('aiConnection', null)
  if (!conn) return null
  // Strip any residual raw apiKey string from before vault migration
  const { apiKey: _dropped, ...rest } = conn
  return rest
}

export function setAiConnection(conn) {
  if (!conn) { setSetting('aiConnection', null); return }
  // Never persist raw API key strings — only apiKeySet: bool
  const { apiKey: _dropped, ...rest } = conn
  setSetting('aiConnection', { ...rest, updatedAt: new Date().toISOString() })
}

export function getSelectedAiPromptId() {
  return getSetting('selectedAiPromptId', null)
}

export function setSelectedAiPromptId(id) {
  setSetting('selectedAiPromptId', id)
}

// ─── Trading fees (Sub-phase 32f, foundation for SPEC-034) ───────────────────
//
// Stored shape on `rmoney_settings.tradingFees`:
//   {
//     exchanges: [{ mic, currency, feePercent, minimumFee }],
//     stocks:    [{ ticker, currency, feePercent, minimumFee }],
//   }
//
// `feePercent` is stored as a percent value (e.g. 0.10 means 0.10 % of the
// trade), not a multiplier. The user reads and types percents in the Settings
// UI, so storing them in the same units avoids silent ×100 mistakes.
// `minimumFee` is the absolute floor in the same currency as the trade.

export function getTradingFees() {
  const fees = getSetting('tradingFees', null)
  return {
    exchanges: Array.isArray(fees?.exchanges) ? fees.exchanges : [],
    stocks:    Array.isArray(fees?.stocks)    ? fees.stocks    : [],
  }
}

export function setTradingFees(config) {
  setSetting('tradingFees', {
    exchanges: Array.isArray(config?.exchanges) ? config.exchanges : [],
    stocks:    Array.isArray(config?.stocks)    ? config.stocks    : [],
  })
}

// Resolution order: per-stock override → per-exchange default → no fee.
// Returns { feeAmount, source: 'stock' | 'exchange' | 'none' }.
// `gross` is the trade gross in the trade currency; `feeAmount` is returned in
// the same currency. Always non-negative.
export function resolveTradingFee(ticker, exchange, gross) {
  const fees   = getTradingFees()
  const t      = ticker?.trim().toUpperCase()
  const mic    = exchange?.trim().toUpperCase()
  const grossN = Math.max(0, Number(gross) || 0)

  function computed(rule) {
    const pct = Math.max(0, Number(rule.feePercent) || 0)
    const min = Math.max(0, Number(rule.minimumFee) || 0)
    const max = rule.maximumFee != null && Number.isFinite(Number(rule.maximumFee))
      ? Math.max(0, Number(rule.maximumFee))
      : Infinity
    return Math.min(max, Math.max(min, grossN * pct / 100))
  }

  if (t) {
    const stockRule = fees.stocks.find(s => s.ticker?.toUpperCase() === t)
    if (stockRule) return { feeAmount: computed(stockRule), source: 'stock' }
  }

  if (mic) {
    const exRule = fees.exchanges.find(e => e.mic?.toUpperCase() === mic)
    if (exRule) return { feeAmount: computed(exRule), source: 'exchange' }
  }

  return { feeAmount: 0, source: 'none' }
}

// ─── Market data providers ───────────────────────────────────────────────────

const DEFAULT_PROVIDERS = {
  ibkr:         { enabled: false, clientId: null, oauth: null },
  yahooFinance: { enabled: true },                // keyless — on by default
  massive:      { enabled: false, apiKeySet: false },
  twelveData:   { enabled: false, apiKeySet: false },
  finnhub:      { enabled: false, apiKeySet: false },
  alphaVantage: { enabled: false, apiKeySet: false },
  stooq:        { enabled: true },                // keyless — on by default
}

export function getMarketDataProviders() {
  const stored = getSetting('marketDataProviders', {})
  // Merge with defaults so any newly-added provider key always has a shape.
  // Strip any residual raw apiKey strings that may exist from before the vault migration.
  function clean(defaults, persisted) {
    const { apiKey: _dropped, ...rest } = { ...defaults, ...(persisted ?? {}) }
    return rest
  }
  return {
    ibkr:         clean(DEFAULT_PROVIDERS.ibkr,         stored.ibkr),
    yahooFinance: clean(DEFAULT_PROVIDERS.yahooFinance,  stored.yahooFinance),
    massive:      clean(DEFAULT_PROVIDERS.massive,       stored.massive),
    twelveData:   clean(DEFAULT_PROVIDERS.twelveData,    stored.twelveData),
    finnhub:      clean(DEFAULT_PROVIDERS.finnhub,       stored.finnhub),
    alphaVantage: clean(DEFAULT_PROVIDERS.alphaVantage,  stored.alphaVantage),
    stooq:        clean(DEFAULT_PROVIDERS.stooq,         stored.stooq),
  }
}

export function setMarketDataProviders(config) {
  // Belt-and-suspenders: never persist raw API key strings
  const safe = {}
  for (const [id, cfg] of Object.entries(config)) {
    const { apiKey: _dropped, ...rest } = cfg
    safe[id] = rest
  }
  setSetting('marketDataProviders', safe)
}

// ─── API cache TTLs ──────────────────────────────────────────────────────────

export function getApiCacheTtl() {
  const s = getSetting('apiCacheTtl', {})
  return {
    pricesMin:          s.pricesMin          ?? 60,
    forexMin:           s.forexMin           ?? 60,
    newsMin:            s.newsMin            ?? 15,
    intradayMin:        s.intradayMin        ?? 5,
    failureCooldownMin: s.failureCooldownMin ?? 15,
  }
}

export function setApiCacheTtl(shape) {
  setSetting('apiCacheTtl', {
    pricesMin:          Number(shape.pricesMin)          || 60,
    forexMin:           Number(shape.forexMin)           || 60,
    newsMin:            Number(shape.newsMin)            || 15,
    intradayMin:        Number(shape.intradayMin)        || 5,
    failureCooldownMin: Number(shape.failureCooldownMin) || 15,
  })
}

// ─── Investing UI state ──────────────────────────────────────────────────────

export function getLastSelectedInvestingAccountId() {
  return getSetting('lastSelectedInvestingAccountId', null)
}

export function setLastSelectedInvestingAccountId(id) {
  setSetting('lastSelectedInvestingAccountId', id ?? null)
}

// ─── Dashboard widgets ───────────────────────────────────────────────────────

const KEY_WIDGETS = 'rmoney_widgets'

function loadWidgets() {
  try {
    return JSON.parse(appStorage.getItem(KEY_WIDGETS)) ?? []
  } catch {
    return []
  }
}

function saveWidgets(widgets) {
  appStorage.setItem(KEY_WIDGETS, JSON.stringify(widgets))
}

export function getWidgets() {
  return loadWidgets().sort((a, b) => a.order - b.order)
}

export function addWidget(type, config) {
  const widgets = loadWidgets()
  const maxOrder = widgets.reduce((m, w) => Math.max(m, w.order), -1)
  const widget = {
    id: crypto.randomUUID(),
    type,
    config,
    order: maxOrder + 1,
  }
  saveWidgets([...widgets, widget])
  return widget
}

export function removeWidget(id) {
  saveWidgets(loadWidgets().filter(w => w.id !== id))
}

export function reorderWidgets(orderedIds) {
  const widgets = loadWidgets()
  const reordered = orderedIds.map((id, i) => {
    const w = widgets.find(w => w.id === id)
    return w ? { ...w, order: i } : null
  }).filter(Boolean)
  // Keep any widgets not in the list at the end
  const remaining = widgets.filter(w => !orderedIds.includes(w.id))
  saveWidgets([...reordered, ...remaining.map((w, i) => ({ ...w, order: reordered.length + i }))])
}
