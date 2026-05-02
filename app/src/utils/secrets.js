// Encrypted secret storage via Tauri Stronghold.
// Dev mode (no Tauri): falls back to rmoney_dev_secrets in localStorage
// with a visible warning banner rendered by App.jsx.
//
// Key convention:
//   marketData/{providerId}/apiKey   — market data provider API keys
//   ai/apiKey                        — AI connection API key

import { Stronghold } from '@tauri-apps/plugin-stronghold'
import { appDataDir, join } from '@tauri-apps/api/path'
import { remove } from '@tauri-apps/plugin-fs'

const IS_TAURI = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
const DEV_KEY = 'rmoney_dev_secrets'
const VAULT_CREATED_FLAG = 'rmoney_vault_created'
const VAULT_FILE = 'vault.hold'
const CLIENT_NAME = 'rmoney'

let _stronghold = null
let _store = null

async function getVaultPath() {
  const dir = await appDataDir()
  return join(dir, VAULT_FILE)
}

export function vaultExists() {
  return !!localStorage.getItem(VAULT_CREATED_FLAG)
}

// Open (or create) the vault with the given passphrase.
// On first open, creates a new vault; on subsequent opens, decrypts the existing one.
export async function openVault(passphrase) {
  if (!IS_TAURI) return
  const path = await getVaultPath()
  _stronghold = await Stronghold.load(path, passphrase)
  try {
    const client = await _stronghold.loadClient(CLIENT_NAME)
    _store = client.getStore()
  } catch {
    const client = await _stronghold.createClient(CLIENT_NAME)
    _store = client.getStore()
    await _stronghold.save()
  }
  localStorage.setItem(VAULT_CREATED_FLAG, '1')
}

// Delete vault file and clear vault state. Used by "forgot passphrase" reset.
export async function deleteVaultFile() {
  if (IS_TAURI) {
    try {
      const path = await getVaultPath()
      await remove(path)
    } catch {
      // File may not exist — ignore
    }
  }
  _stronghold = null
  _store = null
  localStorage.removeItem(VAULT_CREATED_FLAG)
}

export async function getSecret(key) {
  if (!IS_TAURI) {
    const dev = JSON.parse(localStorage.getItem(DEV_KEY) ?? '{}')
    return dev[key] ?? null
  }
  if (!_store) return null
  const raw = await _store.get(key)
  if (!raw) return null
  return new TextDecoder().decode(new Uint8Array(raw))
}

export async function setSecret(key, value) {
  if (!IS_TAURI) {
    const dev = JSON.parse(localStorage.getItem(DEV_KEY) ?? '{}')
    dev[key] = value
    localStorage.setItem(DEV_KEY, JSON.stringify(dev))
    return
  }
  if (!_store) throw new Error('Vault is not open')
  await _store.insert(key, Array.from(new TextEncoder().encode(value)))
  await _stronghold.save()
}

export async function deleteSecret(key) {
  if (!IS_TAURI) {
    const dev = JSON.parse(localStorage.getItem(DEV_KEY) ?? '{}')
    delete dev[key]
    localStorage.setItem(DEV_KEY, JSON.stringify(dev))
    return
  }
  if (!_store) throw new Error('Vault is not open')
  await _store.remove(key)
  await _stronghold.save()
}

// One-time migration (item 250): move any raw API keys from localStorage settings
// into the vault, replacing them with apiKeySet: true flags.
export async function migrateKeysToVault() {
  const raw = localStorage.getItem('rmoney_settings')
  if (!raw) return
  let settings
  try { settings = JSON.parse(raw) } catch { return }

  let dirty = false

  // Market data providers
  const providers = settings.marketDataProviders ?? {}
  for (const [id, cfg] of Object.entries(providers)) {
    if (cfg.apiKey && typeof cfg.apiKey === 'string' && cfg.apiKey !== 'REDACTED') {
      await setSecret(`marketData/${id}/apiKey`, cfg.apiKey)
      cfg.apiKeySet = true
      delete cfg.apiKey
      dirty = true
    }
  }

  // AI connection
  const ai = settings.aiConnection
  if (ai?.apiKey && typeof ai.apiKey === 'string' && ai.apiKey !== 'REDACTED') {
    await setSecret('ai/apiKey', ai.apiKey)
    ai.apiKeySet = true
    delete ai.apiKey
    dirty = true
  }

  if (dirty) {
    localStorage.setItem('rmoney_settings', JSON.stringify(settings))
  }
}
