import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { seedStorage, resetStorage, readStorage } from '../test/storage'
import { getSyncMeta, getSyncBase, updateSyncMeta } from '../data/syncMeta'

// The secrets backend in a non-Tauri environment reads plaintext dev secrets
// from raw localStorage — give node a minimal shim before importing sync.
const localStore = new Map()
globalThis.localStorage = {
  getItem: k => (localStore.has(k) ? localStore.get(k) : null),
  setItem: (k, v) => localStore.set(k, String(v)),
  removeItem: k => localStore.delete(k),
  get length() { return localStore.size },
  key: i => [...localStore.keys()][i] ?? null,
}

const { syncNow, getSyncStatus, _setFetchImpl } = await import('./sync')

// A tiny scripted fetch: each call shifts the next response off the queue.
function scriptFetch(script) {
  const calls = []
  _setFetchImpl(async (url, options) => {
    calls.push({ url, method: options.method, headers: options.headers, body: options.body })
    const next = script.shift()
    if (next instanceof Error) throw next
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      headers: { get: h => (h.toLowerCase() === 'etag' ? next.etag ?? null : null) },
      json: async () => next.json,
    }
  })
  return calls
}

function seedConfigured(extra = {}) {
  seedStorage({
    rmoney_settings: { sync: { url: 'https://nas.example/rmoney', username: 'sync', webdavPasswordSet: true, enabled: true } },
    rmoney_accounts: [{ id: 'acc-1', accountName: 'Main', currency: 'EUR', startingBalance: 0, updatedAt: '2026-07-01T00:00:00.000Z' }],
    ...extra,
  })
  localStore.set('rmoney_dev_secrets', JSON.stringify({ 'sync/webdav/password': 'pw' }))
}

describe('sync engine (SPEC-039, Phase 59)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 9, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    resetStorage()
    localStore.clear()
    _setFetchImpl(null)
  })

  it('does nothing when not configured', async () => {
    seedStorage({})
    const calls = scriptFetch([])
    await syncNow()
    expect(calls).toEqual([])
  })

  it('first sync: GET 404 → uploads the local snapshot with If-None-Match and stores it as base', async () => {
    seedConfigured()
    const calls = scriptFetch([{ status: 404 }, { status: 201 }])
    await syncNow()

    expect(calls[0].method).toBe('GET')
    expect(calls[0].url).toBe('https://nas.example/rmoney/rmoney-sync.json')
    expect(calls[1].method).toBe('PUT')
    expect(calls[1].headers['If-None-Match']).toBe('*')
    const uploaded = JSON.parse(calls[1].body)
    expect(uploaded.accounts).toHaveLength(1)
    expect(uploaded.version).toBe('rmoney-data-v6')

    expect(getSyncBase().accounts).toHaveLength(1)
    expect(getSyncMeta().dirty).toBe(false)
    expect(getSyncMeta().lastSyncAt).not.toBeNull()
    expect(getSyncStatus().status).toBe('idle')
  })

  it('normal cycle: merges the remote, applies it locally, PUTs with If-Match, updates base', async () => {
    seedConfigured()
    const remote = {
      version: 'rmoney-data-v6',
      accounts: [
        { id: 'acc-1', accountName: 'Main', currency: 'EUR', startingBalance: 0, updatedAt: '2026-07-01T00:00:00.000Z' },
        { id: 'acc-2', accountName: 'Phone-added', currency: 'EUR', startingBalance: 5, updatedAt: '2026-07-08T00:00:00.000Z' },
      ],
    }
    const calls = scriptFetch([{ status: 200, etag: '"e1"', json: remote }, { status: 204 }])
    await syncNow()

    // Remote-side addition landed locally…
    expect(readStorage('rmoney_accounts').map(a => a.id).sort()).toEqual(['acc-1', 'acc-2'])
    // …and the upload carried the merged set with the ETag precondition.
    expect(calls[1].headers['If-Match']).toBe('"e1"')
    expect(JSON.parse(calls[1].body).accounts).toHaveLength(2)
    expect(getSyncBase().accounts).toHaveLength(2)
    expect(getSyncMeta().dirty).toBe(false)
  })

  it('412 precondition failure re-pulls and retries', async () => {
    seedConfigured()
    const remoteV1 = { version: 'rmoney-data-v6', accounts: [] }
    const remoteV2 = { version: 'rmoney-data-v6', accounts: [{ id: 'acc-3', updatedAt: '2026-07-09T00:00:00.000Z' }] }
    const calls = scriptFetch([
      { status: 200, etag: '"e1"', json: remoteV1 },
      { status: 412 },                                   // another device wrote meanwhile
      { status: 200, etag: '"e2"', json: remoteV2 },
      { status: 204 },
    ])
    await syncNow()
    expect(calls).toHaveLength(4)
    expect(calls[3].headers['If-Match']).toBe('"e2"')
    expect(JSON.parse(calls[3].body).accounts.map(a => a.id).sort()).toEqual(['acc-1', 'acc-3'])
    expect(getSyncStatus().status).toBe('idle')
  })

  it('unreachable server: silent — status only, dirty flag persists', async () => {
    seedConfigured()
    updateSyncMeta({ dirty: true })
    scriptFetch([new Error('network down')])
    await syncNow()
    expect(getSyncStatus().status).toBe('unreachable')
    expect(getSyncMeta().dirty).toBe(true)   // will retry later
  })

  it('bad credentials surface a friendly, URL-free error', async () => {
    seedConfigured()
    scriptFetch([{ status: 401 }])
    await syncNow()
    const s = getSyncStatus()
    expect(s.status).toBe('error')
    expect(s.lastError).toMatch(/Authentication failed/)
    expect(s.lastError).not.toMatch(/nas\.example/)   // SPEC-031: no URLs in errors
  })
})
