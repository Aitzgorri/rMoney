// Device-sync engine (SPEC-039, Phase 59) — WebDAV transport + opportunistic
// push around the pure merge engine (Phase 58).
//
// Cycle: GET remote file → three-way merge (base = last synced snapshot) →
// apply merged locally → PUT back with an If-Match precondition (retry on 412,
// so two devices can't clobber each other's uploads) → store the new base.
// A missing remote file (first sync) simply uploads the local snapshot.
//
// Push is opportunistic: every data mutation marks the device dirty and
// schedules a debounced sync; unreachability is SILENT (status only) and the
// dirty flag persists so the next mutation / app focus / manual "Sync now"
// retries. SPEC-031: the WebDAV password comes from the secrets backend at call
// time and is never persisted here; error messages never include the URL.
import { exportAppData, redactExportData, importAppData, KEYS } from '../data/portability'
import { mergeSnapshots } from './mergeSnapshots'
import {
  getSyncBase, setSyncBase, getSyncMeta, updateSyncMeta, pruneDeletions,
} from '../data/syncMeta'
import { getSyncConfig } from '../data/settings'
import { getSecret } from './secrets'
import { setAppStorageWriteListener } from './appStorage'

const SYNC_FILENAME = 'rmoney-sync.json'
const DEBOUNCE_MS = 3000
const MAX_PRECONDITION_RETRIES = 3

// Keys whose writes mark the device dirty = exactly the synced collections.
const SYNCED_KEYS = new Set(Object.values(KEYS).filter(k => k !== 'rmoney_api_dividend_history'))

const IS_TAURI = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

// ── Transport ────────────────────────────────────────────────────────────────
// Tauri: native plugin-http (bypasses the strict webview CSP + CORS; allowed by
// the widened http capability, since the NAS host is user-configured and cannot
// be listed statically). Capacitor: CapacitorHttp intercepts fetch natively.
// Plain browser (vite dev): best-effort fetch — the NAS won't send CORS headers,
// so sync realistically needs the desktop or Android build.
let fetchImpl = null   // test seam: _setFetchImpl injects a fake
export function _setFetchImpl(fn) { fetchImpl = fn }

async function webdavFetch(url, options) {
  if (fetchImpl) return fetchImpl(url, options)
  if (IS_TAURI) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
    return tauriFetch(url, options)
  }
  return fetch(url, options)
}

function authHeader(username, password) {
  return 'Basic ' + btoa(`${username}:${password}`)
}

function fileUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '') + '/' + SYNC_FILENAME
}

// ── Status (observable by the UI) ────────────────────────────────────────────

let status = 'idle'   // 'idle' | 'syncing' | 'unreachable' | 'error'
let lastError = null  // short, URL-free message (SPEC-031)
const listeners = new Set()

function setStatus(next, error = null) {
  status = next
  lastError = error
  for (const l of listeners) l(getSyncStatus())
}

export function getSyncStatus() {
  const meta = getSyncMeta()
  const cfg = getSyncConfig()
  return {
    configured: !!(cfg.enabled && cfg.url && cfg.username && cfg.webdavPasswordSet),
    status,
    lastError,
    lastSyncAt: meta.lastSyncAt,
    dirty: meta.dirty,
  }
}

export function subscribeSyncStatus(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// ── Connection test (Settings) ───────────────────────────────────────────────
// HEAD on the sync file: 200/404 both prove the folder is reachable and the
// credentials work; 401/403 means bad credentials or folder permissions.
export async function testConnection(url, username, password) {
  try {
    const res = await webdavFetch(fileUrl(url), {
      method: 'HEAD',
      headers: { Authorization: authHeader(username, password) },
    })
    if (res.status === 200 || res.status === 404) return { ok: true }
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'Authentication failed — check the username and password (and the folder permissions).' }
    return { ok: false, error: `The server answered with status ${res.status}.` }
  } catch {
    return { ok: false, error: 'Could not reach the server — check the URL and that the device can reach the NAS.' }
  }
}

// ── The sync cycle ───────────────────────────────────────────────────────────

function buildLocalSnapshot() {
  const snap = redactExportData(exportAppData({ mode: 'sharable' }))
  snap.exportedAt = new Date().toISOString()
  snap._syncDevice = getSyncMeta().deviceId
  return snap
}

let inFlight = false
let applying = false   // suppresses the write listener while merged data is written
let onApplied = null   // App-level callback to re-render after remote changes land
export function setOnSyncApplied(cb) { onApplied = cb }

export async function syncNow() {
  const cfg = getSyncConfig()
  if (!getSyncStatus().configured || inFlight) return
  inFlight = true
  setStatus('syncing')
  try {
    const password = await getSecret('sync/webdav/password')
    if (!password) throw Object.assign(new Error('no-credential'), { friendly: 'No WebDAV password stored — set it in Settings → Sync.' })
    const auth = { Authorization: authHeader(cfg.username, password) }
    const url = fileUrl(cfg.url)

    let attempt = 0
    for (;;) {
      const res = await webdavFetch(url, { method: 'GET', headers: auth })

      if (res.status === 404) {
        // First sync: nothing remote yet — upload the local snapshot.
        const local = buildLocalSnapshot()
        const put = await webdavFetch(url, {
          method: 'PUT',
          headers: { ...auth, 'Content-Type': 'application/json', 'If-None-Match': '*' },
          body: JSON.stringify(local),
        })
        if (put.status === 412 && attempt++ < MAX_PRECONDITION_RETRIES) continue  // raced another device's first upload
        if (!put.ok && put.status !== 412) throw new Error(`upload failed (${put.status})`)
        if (put.ok) { finishSuccess(local); return }
        throw new Error('upload kept failing the precondition')
      }

      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error('auth'), { friendly: 'Authentication failed — check the sync credentials in Settings.' })
      }
      if (!res.ok) throw new Error(`download failed (${res.status})`)

      const etag = res.headers.get?.('etag') ?? res.headers?.etag ?? null
      const remote = await res.json()
      const local = buildLocalSnapshot()
      const { merged, changes } = mergeSnapshots(getSyncBase(), local, remote)
      merged.exportedAt = new Date().toISOString()
      merged._syncDevice = getSyncMeta().deviceId

      // Apply the merged result locally (remote-side changes land here). The
      // write listener is suppressed so applying doesn't re-mark the device dirty.
      applying = true
      try { importAppData(merged) } finally { applying = false }

      const put = await webdavFetch(url, {
        method: 'PUT',
        headers: { ...auth, 'Content-Type': 'application/json', ...(etag ? { 'If-Match': etag } : {}) },
        body: JSON.stringify(merged),
      })
      if (put.status === 412 && attempt++ < MAX_PRECONDITION_RETRIES) continue   // another device wrote meanwhile — re-pull and re-merge
      if (!put.ok) throw new Error(`upload failed (${put.status})`)

      finishSuccess(merged, changes)
      return
    }
  } catch (e) {
    // SPEC-031: never include the URL in surfaced errors.
    const friendly = e?.friendly ?? null
    setStatus(friendly ? 'error' : 'unreachable', friendly)
  } finally {
    inFlight = false
  }
}

function finishSuccess(base, changes = []) {
  setSyncBase(base)
  updateSyncMeta({ lastSyncAt: new Date().toISOString(), dirty: false })
  pruneDeletions()
  setStatus('idle')
  if (changes.length > 0) onApplied?.(changes)
}

// ── Opportunistic push ───────────────────────────────────────────────────────

let debounceTimer = null

function onLocalWrite(key) {
  if (applying || !SYNCED_KEYS.has(key)) return
  const meta = getSyncMeta()
  if (!meta.dirty) updateSyncMeta({ dirty: true })
  if (!getSyncStatus().configured) return
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { syncNow() }, DEBOUNCE_MS)
}

// Wire the listeners once at app startup (App.jsx). Also retries on window
// focus when there are unsynced changes.
export function initSync() {
  setAppStorageWriteListener(onLocalWrite)
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', () => {
      if (getSyncStatus().configured && getSyncMeta().dirty) syncNow()
    })
  }
}
