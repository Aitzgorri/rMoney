// Central storage wrapper for rMoney's app-data collections — every `rmoney_*`
// key that holds user data, market caches, or UI preferences. Introduced in
// Phase 39a as a thin pass-through to localStorage (no behaviour change).
//
// Phase 39e adds a SWAPPABLE BACKEND selected by the active security mode:
//   • `none` / `keys` modes → plain localStorage (today's behaviour).
//   • `app` mode            → an in-memory Map, hydrated from the decrypted vault
//                             snapshot on unlock and flushed back (encrypted,
//                             debounced) on every mutation. The plaintext snapshot
//                             is NEVER written to localStorage or disk.
// Routing every app-data read/write through this module is what makes that swap
// transparent to the 37 call sites.
//
// Do NOT route these infrastructure keys through appStorage — they must be
// readable before any store is hydrated and live outside the active mode, so
// they keep direct `localStorage` access:
//   • rmoney_vault_created   — whether a Stronghold vault exists   (secrets.js)
//   • rmoney_dev_secrets     — dev-mode / `none`-mode plaintext keys (secrets.js)
//   • rmoney_security_mode   — which access mode is active         (Phase 39b)
//
// API mirrors the localStorage subset the app actually uses, so call sites
// migrate by swapping the `localStorage` token for `appStorage`. `keys()`
// replaces the `localStorage.length` + `localStorage.key(i)` enumeration used
// by bulk operations (reset / snapshot).

// ─── Backends ────────────────────────────────────────────────────────────────

const localBackend = {
  getItem(key) { return localStorage.getItem(key) },
  setItem(key, value) { localStorage.setItem(key, value) },
  removeItem(key) { localStorage.removeItem(key) },
  keys() { return Object.keys(localStorage) },
}

// The in-memory store used in `app` mode. `null` whenever the localStorage
// backend is active, so other modules can detect the mode cheaply.
let memoryStore = null
let onMutate = null

function memoryBackend() {
  return {
    getItem(key) { return memoryStore.has(key) ? memoryStore.get(key) : null },
    setItem(key, value) { memoryStore.set(key, String(value)); onMutate?.() },
    removeItem(key) { memoryStore.delete(key); onMutate?.() },
    keys() { return Array.from(memoryStore.keys()) },
  }
}

let backend = localBackend

// ─── Public storage API (used by all 37 app-data call sites) ─────────────────

const appStorage = {
  getItem(key) { return backend.getItem(key) },
  setItem(key, value) { backend.setItem(key, value) },
  removeItem(key) { backend.removeItem(key) },
  keys() { return backend.keys() },
}

export default appStorage

// ─── `app`-mode lifecycle (called by appData.js) ─────────────────────────────

// Switch to the in-memory backend, seeded with the decrypted snapshot.
// `mutateCallback` is invoked after every write so appData can debounce-flush
// the encrypted snapshot back to the vault.
export function activateMemoryBackend(initial, mutateCallback) {
  memoryStore = new Map(Object.entries(initial || {}))
  onMutate = mutateCallback
  backend = memoryBackend()
}

// Whether the in-memory (`app`-mode) backend is currently active.
export function isMemoryBackendActive() {
  return memoryStore !== null
}

// A plain-object copy of the in-memory store, for encryption into the vault.
export function snapshotMemory() {
  return memoryStore ? Object.fromEntries(memoryStore) : {}
}

// Drop the in-memory store and revert to localStorage (on lock / app close).
// Nothing decrypted remains in memory afterward.
export function dropMemoryBackend() {
  memoryStore = null
  onMutate = null
  backend = localBackend
}
