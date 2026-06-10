// Central storage wrapper for rMoney's app-data collections — every `rmoney_*`
// key that holds user data, market caches, or UI preferences. Introduced in
// Phase 39a as a thin pass-through to localStorage (no behaviour change).
// Phase 39e swaps the backend for an in-memory store in `app` security mode so
// decrypted data never lands on disk; routing every app-data read/write through
// this module now is what makes that swap a one-line change later.
//
// Do NOT route these infrastructure keys through appStorage — they must be
// readable before any store is hydrated and live outside the active mode, so
// they keep direct `localStorage` access:
//   • rmoney_vault_created   — whether a Stronghold vault exists   (secrets.js)
//   • rmoney_dev_secrets     — dev-mode plaintext key fallback     (secrets.js)
//   • rmoney_security_mode   — which access mode is active         (Phase 39b)
//
// API mirrors the localStorage subset the app actually uses, so call sites
// migrate by swapping the `localStorage` token for `appStorage`. `keys()`
// replaces the `localStorage.length` + `localStorage.key(i)` enumeration used
// by bulk operations (reset / snapshot).

const appStorage = {
  getItem(key) {
    return localStorage.getItem(key)
  },
  setItem(key, value) {
    localStorage.setItem(key, value)
  },
  removeItem(key) {
    localStorage.removeItem(key)
  },
  keys() {
    return Object.keys(localStorage)
  },
}

export default appStorage
