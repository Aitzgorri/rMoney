// Test-only storage helper (Phase 57b, SPEC-040).
//
// Data-layer modules (src/data/*.js) read and write through the appStorage
// wrapper (Phase 39a). In tests we activate its in-memory backend — the same
// backend `app` security mode uses in production — so the real code paths run
// against seeded storage with no browser and no localStorage mock.
//
// Usage:
//   beforeEach(() => seedStorage({ rmoney_transactions: [ ... ] }))
//   afterEach(resetStorage)
//
// Collection values are JSON-stringified automatically (pass a string to store
// it verbatim). `readStorage(key)` parses a collection back out for asserts.
import appStorage, { activateMemoryBackend, dropMemoryBackend } from '../utils/appStorage'

export function seedStorage(collections = {}) {
  const initial = {}
  for (const [key, value] of Object.entries(collections)) {
    initial[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }
  activateMemoryBackend(initial)
}

export function resetStorage() {
  dropMemoryBackend()
}

export function readStorage(key) {
  const raw = appStorage.getItem(key)
  return raw == null ? null : JSON.parse(raw)
}
