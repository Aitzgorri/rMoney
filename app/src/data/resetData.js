// Reset data — clears all rmoney_* localStorage and Stronghold secrets,
// optionally carrying over selected configuration islands (SPEC-016 § Reset data).
//
// The function takes a `preserve` object indicating which islands to keep, snapshots
// them, wipes everything, then restores. After a successful reset the caller should
// reload the page (window.location.reload) so React re-mounts as if freshly installed.

import {
  getSecret, setSecret, deleteSecret, deleteVaultFile,
} from '../utils/secrets'

// Keyed market data providers whose API keys live in Stronghold.
const KEYED_PROVIDERS = ['massive', 'twelveData', 'finnhub', 'alphaVantage']

// Settings sub-fields each preserve island wants to keep when set.
// During restore, the union of these sub-fields is written to a fresh rmoney_settings.
const SETTINGS_FIELDS_BY_ISLAND = {
  marketDataKeys: ['marketDataProviders'],
  aiKey:          ['aiConnection'],
  taxSetup:       ['dividends'],
  tradingFees:    ['tradingFees'],
}

// Whole localStorage keys preserved by each island.
const LOCAL_KEYS_BY_ISLAND = {
  envelopes:      ['rmoney_envelopes'],
  categories:     ['rmoney_categories'],
  csvTemplates:   ['rmoney_csv_templates'],
  stockInventory: ['rmoney_stock_profiles', 'rmoney_manual_prices'],
}

function readSettings() {
  try { return JSON.parse(localStorage.getItem('rmoney_settings')) ?? {} } catch { return {} }
}

// Snapshot the parts of state covered by enabled preserve islands.
// Returns { localKeys: {k:v}, settings: {field:v}, secrets: {key:v} }.
async function snapshot(preserve) {
  const localKeys = {}
  const settings  = {}
  const secrets   = {}
  const stored = readSettings()

  for (const [island, enabled] of Object.entries(preserve)) {
    if (!enabled) continue

    for (const k of LOCAL_KEYS_BY_ISLAND[island] ?? []) {
      const v = localStorage.getItem(k)
      if (v !== null) localKeys[k] = v
    }

    for (const field of SETTINGS_FIELDS_BY_ISLAND[island] ?? []) {
      if (stored[field] !== undefined) settings[field] = stored[field]
    }
  }

  // Stronghold secrets — independent of the localStorage path.
  if (preserve.marketDataKeys) {
    for (const id of KEYED_PROVIDERS) {
      if (stored.marketDataProviders?.[id]?.apiKeySet) {
        try {
          const v = await getSecret(`marketData/${id}/apiKey`)
          if (v) secrets[`marketData/${id}/apiKey`] = v
        } catch { /* best effort */ }
      }
    }
  }
  if (preserve.aiKey && stored.aiConnection?.apiKeySet) {
    try {
      const v = await getSecret('ai/apiKey')
      if (v) secrets['ai/apiKey'] = v
    } catch { /* best effort */ }
  }

  return { localKeys, settings, secrets }
}

// Clear every rmoney_* localStorage key.
function clearRmoneyLocal() {
  const toRemove = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith('rmoney_')) toRemove.push(k)
  }
  for (const k of toRemove) localStorage.removeItem(k)
}

// Restore the snapshot into a fresh app state.
async function restore(snap) {
  for (const [k, v] of Object.entries(snap.localKeys)) {
    localStorage.setItem(k, v)
  }
  if (Object.keys(snap.settings).length > 0) {
    localStorage.setItem('rmoney_settings', JSON.stringify(snap.settings))
  }
  for (const [k, v] of Object.entries(snap.secrets)) {
    try { await setSecret(k, v) } catch { /* best effort */ }
  }
  // If we kept any secrets, the vault file is still on disk; restore the boot
  // flag so the app re-opens in unlock mode rather than setup mode. Without
  // this, clearRmoneyLocal above would wipe the flag and the existing vault
  // file would be unreachable until the user typed a new passphrase.
  if (Object.keys(snap.secrets).length > 0) {
    localStorage.setItem('rmoney_vault_created', '1')
  }
}

// Clear secrets not covered by the snapshot.
// If snap.secrets is empty AND no secrets are preserved, the vault file itself is removed
// (mimics fresh install). Otherwise each non-preserved secret record is deleted individually.
async function clearSecrets(snap) {
  const preservedKeys = new Set(Object.keys(snap.secrets))
  if (preservedKeys.size === 0) {
    try { await deleteVaultFile() } catch { /* best effort */ }
    return
  }
  const allKeys = [
    ...KEYED_PROVIDERS.map(id => `marketData/${id}/apiKey`),
    'ai/apiKey',
  ]
  for (const k of allKeys) {
    if (preservedKeys.has(k)) continue
    try { await deleteSecret(k) } catch { /* best effort — record may not exist */ }
  }
}

// Main entry point. preserve = { marketDataKeys, aiKey, envelopes, categories, taxSetup, tradingFees, csvTemplates, stockInventory } booleans.
export async function resetAppData(preserve) {
  const snap = await snapshot(preserve)
  clearRmoneyLocal()
  await clearSecrets(snap)
  await restore(snap)
}
