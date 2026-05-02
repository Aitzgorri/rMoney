import { inferLocaleCurrency } from '../utils/currency'

const KEY = 'rmoney_settings'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {}
  } catch {
    return {}
  }
}

function save(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings))
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
    return JSON.parse(localStorage.getItem(KEY_WIDGETS)) ?? []
  } catch {
    return []
  }
}

function saveWidgets(widgets) {
  localStorage.setItem(KEY_WIDGETS, JSON.stringify(widgets))
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
