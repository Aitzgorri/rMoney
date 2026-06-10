// `app`-mode data orchestration (SPEC-031 § Storage architecture, Strategy B —
// Phase 39e). Bridges the in-memory appStorage backend and the encrypted vault
// snapshot: hydrate on unlock, debounced-encrypt on every change, flush + drop
// on lock / app close. The decrypted data lives only in the in-memory Map; the
// plaintext snapshot is never written to localStorage or disk.

import {
  activateMemoryBackend, snapshotMemory, dropMemoryBackend, isMemoryBackendActive,
} from './appStorage'
import { loadDataSnapshot, saveDataSnapshot, isVaultOpen } from './secrets'

const FLUSH_DEBOUNCE_MS = 500

// Infrastructure keys that must stay in raw localStorage (mirrors appStorage.js).
// They are NOT part of the app-data snapshot.
const INFRA_KEYS = new Set([
  'rmoney_vault_created',
  'rmoney_dev_secrets',
  'rmoney_security_mode',
])

let flushTimer = null

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => { flushAppStore() }, FLUSH_DEBOUNCE_MS)
}

// Encrypt the current in-memory store into the vault now. Safe to call anytime;
// a no-op when the in-memory backend is not active or the vault is closed.
export async function flushAppStore() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  if (!isMemoryBackendActive() || !isVaultOpen()) return
  await saveDataSnapshot(snapshotMemory())
}

// Collect every plaintext app-data key/value currently in localStorage.
function collectLocalAppData() {
  const out = {}
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith('rmoney_') && !INFRA_KEYS.has(k)) {
      out[k] = localStorage.getItem(k)
    }
  }
  return out
}

// Remove every plaintext app-data key from localStorage (after it has been
// migrated into the encrypted snapshot).
function clearLocalAppData() {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith('rmoney_') && !INFRA_KEYS.has(k)) {
      localStorage.removeItem(k)
    }
  }
}

// Migrate the current plaintext localStorage app data INTO the vault: seed the
// in-memory backend from it, write the encrypted snapshot (overwriting any stale
// one), then clear the plaintext copies. Always builds the snapshot from live
// localStorage, so it is the correct path when SWITCHING into `app` mode — where
// any pre-existing snapshot must be treated as stale. The vault must be open.
export async function migrateLocalDataIntoVault() {
  const migrated = collectLocalAppData()
  activateMemoryBackend(migrated, scheduleFlush)
  await flushAppStore()         // persist the migrated snapshot
  clearLocalAppData()           // only after a successful write
}

// Hydrate the in-memory backend and engage `app` mode. Call once, right after
// the vault is opened at startup (unlock or setup) when the active mode is
// `app`. If the vault already has a snapshot it is the source of truth and is
// loaded as-is; otherwise (first launch in `app` mode, or an existing-vault user
// upgrading) the current plaintext localStorage data is migrated in.
export async function hydrateAppStore() {
  const snap = await loadDataSnapshot()
  if (snap === null) {
    await migrateLocalDataIntoVault()
  } else {
    activateMemoryBackend(snap, scheduleFlush)
  }
}

// Flush and drop the in-memory store (on lock / app close). After this, nothing
// decrypted remains in memory and reads fall back to localStorage.
export async function lockAppStore() {
  await flushAppStore()
  dropMemoryBackend()
}

// Register lifecycle flushes so an `app`-mode session is durable across tab
// hide / reload / close. Returns a cleanup function. No-op outside `app` mode.
export function installAppStoreLifecycle() {
  const onHide = () => { if (document.visibilityState === 'hidden') flushAppStore() }
  // `beforeunload` cannot await; we kick off a best-effort synchronous flush.
  const onUnload = () => { flushAppStore() }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('beforeunload', onUnload)
  return () => {
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('beforeunload', onUnload)
  }
}
