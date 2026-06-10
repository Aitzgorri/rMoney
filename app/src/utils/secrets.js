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

// Human-readable copy for each mode, shared by the Settings → Security tab and
// the first-launch mode-selection screen (Phase 39c). Keys mirror SECURITY_MODES.
export const SECURITY_MODE_INFO = {
  app: {
    label: 'App password',
    protects: 'The whole app — all data encrypted at rest',
    desc: 'A passphrase is required every time you open rMoney. Your API keys and all financial data live in an encrypted vault and are decrypted only in memory while the app is open. Strongest protection — guards against a lost or imaged disk.',
  },
  keys: {
    label: 'Keys-only password',
    protects: 'API keys only',
    desc: 'The app opens with no prompt. A passphrase protects only your market-data and AI API keys, requested the first time a key is needed. Your financial data is stored unencrypted on this device.',
  },
  none: {
    label: 'No password',
    protects: 'Nothing — lowest security',
    desc: 'No passphrase anywhere. API keys are stored unencrypted on this device. Convenient, but anyone with access to this device can read your keys and data.',
  },
}

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

// Whether the user has made an explicit mode choice. False on a brand-new
// install (and after a full reset), which is how the first-launch flow knows to
// show the mode-selection screen instead of inferring a default. Distinct from
// getSecurityMode(), which always returns a usable mode by inferring one.
export function isSecurityModeSet() {
  return SECURITY_MODES.includes(localStorage.getItem(SECURITY_MODE_KEY))
}

// Whether the encrypted modes ('app' / 'keys') are possible on this build.
// Stronghold is Tauri-only; the web/Capacitor builds can only use 'none'.
export function isEncryptionAvailable() {
  return IS_TAURI
}

// Whether the Stronghold vault is currently open (decrypted) this session.
export function isVaultOpen() {
  return !!_store
}

// ─── Plaintext key backend ('none' mode + web/Capacitor) ────────────────────
// In 'none' mode keys are stored unencrypted in rmoney_dev_secrets — the same
// mechanism used in non-Tauri dev mode, now a first-class backend (Phase 39d).

function devGet(key) {
  const dev = JSON.parse(localStorage.getItem(DEV_KEY) ?? '{}')
  return dev[key] ?? null
}

function devSet(key, value) {
  const dev = JSON.parse(localStorage.getItem(DEV_KEY) ?? '{}')
  dev[key] = value
  localStorage.setItem(DEV_KEY, JSON.stringify(dev))
}

function devDelete(key) {
  const dev = JSON.parse(localStorage.getItem(DEV_KEY) ?? '{}')
  delete dev[key]
  localStorage.setItem(DEV_KEY, JSON.stringify(dev))
}

// True when secrets should use the plaintext backend rather than the vault:
// either there is no Stronghold (web/Capacitor) or the active mode is 'none'.
function usesPlaintextSecrets() {
  return !IS_TAURI || getSecurityMode() === 'none'
}

const encode = str => Array.from(new TextEncoder().encode(str))
const decode = bytes => new TextDecoder().decode(new Uint8Array(bytes))

// ─── Low-level accessors for mode transitions ───────────────────────────────
// Mode transitions (Settings → Security) move secrets between the vault and the
// plaintext backend while getSecurityMode() is mid-change, so they must address
// each backend explicitly rather than through the mode-aware getSecret/setSecret.

export async function vaultGet(key) {
  if (!IS_TAURI || !_store) return null
  const raw = await _store.get(key)
  if (!raw) return null
  return decode(raw)
}

export async function vaultSet(key, value) {
  if (!IS_TAURI || !_store) throw new Error('Vault is not open')
  await _store.insert(key, encode(value))
  await _stronghold.save()
}

export async function vaultRemove(key) {
  if (!IS_TAURI || !_store) return
  try { await _store.remove(key) } catch { /* record may not exist */ }
  await _stronghold.save()
}

export const plainGet = devGet
export const plainSet = devSet
export const plainDelete = devDelete

// ─── Lazy unlock gate ('keys' mode) ─────────────────────────────────────────
// In 'keys' mode the app opens without a prompt and the vault is unlocked the
// first time a secret is actually needed. App.jsx registers an interactive
// unlock handler (shows a passphrase modal) via setVaultUnlockHandler; the
// secret accessors await ensureVaultOpen() before touching the store.

let _unlockHandler = null
let _unlockInFlight = null

export function setVaultUnlockHandler(fn) {
  _unlockHandler = fn
}

// Ensure the vault is open before a secret read/write in an encrypted mode.
// Returns true if usable. In 'none' mode / non-Tauri there is no vault to open.
// Concurrent callers (e.g. several market-data fetches at once) share a single
// in-flight unlock so only one passphrase prompt is shown.
export async function ensureVaultOpen() {
  if (usesPlaintextSecrets()) return true
  if (_store) return true                 // already open (app mode, or earlier unlock)
  if (!vaultExists()) return true         // no vault yet (no keys saved) — nothing to open
  if (!_unlockHandler) return false
  if (!_unlockInFlight) {
    _unlockInFlight = Promise.resolve(_unlockHandler()).finally(() => { _unlockInFlight = null })
  }
  await _unlockInFlight
  return !!_store
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
  if (usesPlaintextSecrets()) return devGet(key)
  await ensureVaultOpen()
  if (!_store) return null
  const raw = await _store.get(key)
  if (!raw) return null
  return decode(raw)
}

export async function setSecret(key, value) {
  if (usesPlaintextSecrets()) return devSet(key, value)
  await ensureVaultOpen()
  if (!_store) throw new Error('Vault is not open')
  await _store.insert(key, encode(value))
  await _stronghold.save()
}

export async function deleteSecret(key) {
  if (usesPlaintextSecrets()) return devDelete(key)
  await ensureVaultOpen()
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

// ─── App-data snapshot in the vault ('app' mode, Strategy B — Phase 39e) ─────
// The full set of `rmoney_*` app-data key/values is persisted as a single
// encrypted Stronghold record so decrypted data never touches the disk. The
// snapshot is versioned independently of the on-disk backup format so the
// in-vault shape can evolve on its own.

const SNAPSHOT_KEY = 'appData/snapshot'
const SNAPSHOT_VERSION_KEY = 'appData/snapshotVersion'
export const SNAPSHOT_VERSION = 1

// Canonical list of per-key secret records (API keys). Used by passphrase
// re-keying and by mode transitions that move keys between backends.
const KEYED_PROVIDERS = ['massive', 'twelveData', 'finnhub', 'alphaVantage']
export const ALL_SECRET_KEYS = [
  ...KEYED_PROVIDERS.map(id => `marketData/${id}/apiKey`),
  'ai/apiKey',
]

// Write the decrypted app-data object as one encrypted record. Vault must be open.
export async function saveDataSnapshot(obj) {
  if (!IS_TAURI || !_store) return
  await _store.insert(SNAPSHOT_KEY, encode(JSON.stringify(obj)))
  await _store.insert(SNAPSHOT_VERSION_KEY, encode(String(SNAPSHOT_VERSION)))
  await _stronghold.save()
}

// Read and parse the app-data snapshot, or null if none exists yet. Vault must
// be open. `null` (vs `{}`) is the signal that a one-time migration is needed.
export async function loadDataSnapshot() {
  if (!IS_TAURI || !_store) return null
  const raw = await _store.get(SNAPSHOT_KEY)
  if (!raw) return null
  try { return JSON.parse(decode(raw)) } catch { return {} }
}

// Re-key the vault: copy every record into a fresh vault encrypted with a new
// passphrase. The old passphrase is required (and verified by the load). The
// data snapshot, if present, travels with the keys so `app` mode survives a
// passphrase change. Best-effort `unload` releases the file handle before the
// file is replaced (important on Windows where an open handle locks the file).
export async function changePassphrase(oldPass, newPass) {
  if (!IS_TAURI) return
  // Load with the old passphrase — throws on a wrong passphrase, which the
  // caller surfaces as "incorrect current passphrase".
  await openVault(oldPass)
  const records = {}
  for (const k of [...ALL_SECRET_KEYS, SNAPSHOT_KEY, SNAPSHOT_VERSION_KEY]) {
    const raw = await _store.get(k)
    if (raw && raw.length) records[k] = Array.from(raw)
  }
  try { await _stronghold?.unload() } catch { /* plugin may not expose unload */ }
  await deleteVaultFile()
  await openVault(newPass)
  for (const [k, raw] of Object.entries(records)) {
    await _store.insert(k, raw)
  }
  await _stronghold.save()
}
