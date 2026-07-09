// Device-sync groundwork (SPEC-039, Phase 58) — tombstones + per-device sync
// state. The tombstone log IS synced (it rides in the backup payload, v6); the
// device id / base snapshot / dirty flag are strictly device-local and are NOT
// part of any backup (each device must keep its own).
import appStorage from '../utils/appStorage'

const KEY_DELETIONS = 'rmoney_deletions'      // synced (backup v6)
const KEY_SYNC_META = 'rmoney_sync_meta'      // device-local: { deviceId, lastSyncAt, dirty }
const KEY_SYNC_BASE = 'rmoney_sync_base'      // device-local: last successfully synced snapshot

function load(key, fallback) {
  try { return JSON.parse(appStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function save(key, v) { appStorage.setItem(key, JSON.stringify(v)) }

// ── Tombstones ───────────────────────────────────────────────────────────────

// Record that `id` was deleted from the collection stored under `storageKey`
// (e.g. 'rmoney_transactions'). Called by every data-layer delete path so a
// deletion can never resurrect from another device during a merge.
export function recordDeletion(storageKey, id) {
  if (!id) return
  const list = load(KEY_DELETIONS, [])
  save(KEY_DELETIONS, [...list, { collection: storageKey, id, deletedAt: new Date().toISOString() }])
}

export function getDeletions() {
  return load(KEY_DELETIONS, [])
}

export function setDeletions(list) {
  save(KEY_DELETIONS, list ?? [])
}

// Drop tombstones older than the retention window. Called by the sync cycle
// (Phase 59) AFTER a successful sync — a tombstone only needs to live long
// enough for every device to have seen it.
export function pruneDeletions(retentionDays = 180, now = new Date()) {
  const cutoff = new Date(now.getTime() - retentionDays * 86400000).toISOString()
  const list = load(KEY_DELETIONS, [])
  const kept = list.filter(d => d.deletedAt >= cutoff)
  if (kept.length !== list.length) save(KEY_DELETIONS, kept)
  return list.length - kept.length
}

// Storage-tab stats (SPEC-026 convention: byte sizes via Blob/JSON).
export function getDeletionsStats() {
  const list = getDeletions()
  return { count: list.length, bytes: new Blob([JSON.stringify(list)]).size }
}

// ── Device-local sync state ──────────────────────────────────────────────────

export function getSyncMeta() {
  const meta = load(KEY_SYNC_META, null)
  if (meta?.deviceId) return meta
  const created = {
    deviceId: `dev_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
    lastSyncAt: null,
    dirty: false,
    ...(meta ?? {}),
  }
  save(KEY_SYNC_META, created)
  return created
}

export function updateSyncMeta(fields) {
  save(KEY_SYNC_META, { ...getSyncMeta(), ...fields })
}

// The last successfully synced snapshot — the three-way merge base. Only the
// latest base is kept.
export function getSyncBase() {
  return load(KEY_SYNC_BASE, null)
}

export function setSyncBase(snapshot) {
  save(KEY_SYNC_BASE, snapshot)
}
