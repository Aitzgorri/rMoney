// Encrypted secret storage via Tauri Stronghold.
// Dev mode (no Tauri): falls back to rmoney_dev_secrets in localStorage
// with a visible warning banner rendered by App.jsx.
//
// Key convention:
//   marketData/{providerId}/apiKey   — market data provider API keys
//   ai/apiKey                        — AI connection API key

import { Stronghold } from '@tauri-apps/plugin-stronghold'
import { appDataDir, join } from '@tauri-apps/api/path'
import { remove, readFile, writeFile, mkdir, exists } from '@tauri-apps/plugin-fs'

const IS_TAURI = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
const DEV_KEY = 'rmoney_dev_secrets'
const VAULT_CREATED_FLAG = 'rmoney_vault_created'
const SECURITY_MODE_KEY = 'rmoney_security_mode'
const VAULT_FILE = 'vault.hold'
const CLIENT_NAME = 'rmoney'

// The access / password modes (SPEC-031 § Access and password modes, Phase 39):
//   'app'  — passphrase protects the whole app; all data encrypted at rest.
//   'keys' — passphrase protects API keys only; app opens freely.
//   'none' — no passphrase; keys stored unencrypted.
export const SECURITY_MODES = ['app', 'keys', 'none']

let _stronghold = null
let _store = null

async function getVaultPath() {
  const dir = await appDataDir()
  return join(dir, VAULT_FILE)
}

export function vaultExists() {
  return !!localStorage.getItem(VAULT_CREATED_FLAG)
}

// ─── Access / password mode (Phase 39) ──────────────────────────────────────
// Stored as a dedicated top-level localStorage flag — NOT inside rmoney_settings
// — because App.jsx must read it before the appStorage store is hydrated, and in
// 'app' mode the settings blob itself lives encrypted in the vault. It is a
// non-secret flag, so plain localStorage is correct (same class as
// rmoney_vault_created), and it is never routed through appStorage.

export function getSecurityMode() {
  const stored = localStorage.getItem(SECURITY_MODE_KEY)
  if (SECURITY_MODES.includes(stored)) return stored
  // Unset (pre-39 install or fresh start): infer from the environment so the UI
  // and the startup gate keep behaving like today until the user makes an
  // explicit choice (first-launch flow / mode switching land in later sub-phases).
  //   Tauri build  → 'app'  — a vault + startup passphrase is today's behaviour.
  //   Web/Capacitor → 'none' — no vault is possible; keys are plaintext today.
  return IS_TAURI ? 'app' : 'none'
}

export function setSecurityMode(mode) {
  if (!SECURITY_MODES.includes(mode)) throw new Error(`Invalid security mode: ${mode}`)
  localStorage.setItem(SECURITY_MODE_KEY, mode)
}

// Whether the encrypted modes ('app' / 'keys') are possible on this build.
// Stronghold is Tauri-only; the web/Capacitor builds can only use 'none'.
export function isEncryptionAvailable() {
  return IS_TAURI
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

// ─── Full Backup vault embed (SPEC-031 item 241a / Sub-phase 33n) ───────────

// Verify the passphrase by attempting a fresh Stronghold load. Returns true if
// the load succeeds, false otherwise. Does NOT mutate module state — the
// verification handle is discarded; the existing `_stronghold` keeps serving
// secret reads/writes for the rest of the session.
export async function verifyPassphrase(passphrase) {
  if (!IS_TAURI) return true   // dev mode: no real vault, treat as valid
  if (!passphrase) return false
  try {
    const path = await getVaultPath()
    await Stronghold.load(path, passphrase)
    return true
  } catch {
    return false
  }
}

// Returns the encrypted vault snapshot as a Uint8Array, or null if no vault
// exists. The bytes are the on-disk Stronghold file as-is — already encrypted
// with the master passphrase, safe to embed in a backup without the passphrase.
export async function readVaultBytes() {
  if (!IS_TAURI) return null
  if (!vaultExists()) return null
  // Make sure the in-memory vault is flushed to disk before we read it.
  if (_stronghold) {
    try { await _stronghold.save() } catch { /* best effort */ }
  }
  const path = await getVaultPath()
  if (!(await exists(path))) return null
  return await readFile(path)
}

// Writes vault snapshot bytes to the vault file path and marks the vault as
// existing. Used by Full Backup restore. The caller is responsible for
// triggering an app reload so the unlock flow picks up the new vault.
export async function writeVaultBytes(bytes) {
  if (!IS_TAURI) return
  const dir = await appDataDir()
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true })
  }
  const path = await getVaultPath()
  await writeFile(path, bytes)
  // Drop any open handle so the restored vault is loaded fresh on next unlock.
  _stronghold = null
  _store = null
  localStorage.setItem(VAULT_CREATED_FLAG, '1')
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
