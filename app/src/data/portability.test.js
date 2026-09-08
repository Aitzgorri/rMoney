// Export redaction — SPEC-016 (data portability) + SPEC-039 (device sync).
//
// Phase 67 split the single redaction into two paths that must NOT converge:
//   • redactExportData    → the sync payload. Keeps `settings.sync` and
//     `deletions`; sync propagation depends on both.
//   • redactForFileExport → a file handed to someone else. Drops both.
//
// The tests below pin that difference from both directions: the file export
// must not leak the NAS config, and the sync payload must not lose the
// tombstone log (dropping it there would resurrect deleted records on the
// other device — a silent, data-corrupting regression).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { seedStorage, resetStorage } from '../test/storage'
import { redactExportData, redactForFileExport, importAppData } from './portability'
import { getSyncConfig } from './settings'

// A payload shaped like exportAppData({ mode: 'sharable' }) output, carrying
// every field the two paths disagree about.
function payload() {
  return {
    version: 'rmoney-data-v7',
    exportedAt: '2026-08-21T10:00:00.000Z',
    accounts: [{ id: 'acc-1', accountName: 'Main' }],
    transactions: [],
    deletions: [
      { collection: 'transactions', id: 'txn-9', deletedAt: '2026-08-20T09:00:00.000Z' },
    ],
    settings: {
      sync: {
        url: 'https://nas.example:5006/rmoney-sync',
        username: 'rmoney-sync',
        webdavPasswordSet: true,
        enabled: true,
      },
      aiConnection: { apiKey: 'sk-ant-secret-value', model: 'claude-opus-5' },
      marketDataProviders: {
        finnhub: { apiKey: 'finnhub-secret-value', enabled: true },
      },
    },
  }
}

describe('redactForFileExport — Device-Sync scrub (SPEC-039)', () => {
  it('drops settings.sync so the NAS URL and username never leave the machine', () => {
    const out = redactForFileExport(payload())
    expect(out.settings.sync).toBeUndefined()
    // Belt and braces: the values must not survive anywhere in the payload.
    const serialised = JSON.stringify(out)
    expect(serialised).not.toContain('nas.example')
    expect(serialised).not.toContain('rmoney-sync')
  })

  it('drops the deletions tombstone log', () => {
    const out = redactForFileExport(payload())
    expect(out.deletions).toBeUndefined()
  })

  it('still redacts API keys and tokens', () => {
    const out = redactForFileExport(payload())
    expect(out.settings.aiConnection.apiKey).toBe('[REDACTED]')
    expect(out.settings.marketDataProviders.finnhub.apiKey).toBe('[REDACTED]')
    expect(out._redacted).toBe(true)
    expect(JSON.stringify(out)).not.toContain('secret-value')
  })

  it('keeps the non-sync payload intact', () => {
    const out = redactForFileExport(payload())
    expect(out.accounts).toEqual([{ id: 'acc-1', accountName: 'Main' }])
    expect(out.version).toBe('rmoney-data-v7')
    expect(out.settings.aiConnection.model).toBe('claude-opus-5')
  })

  it('does not mutate the caller payload', () => {
    const input = payload()
    redactForFileExport(input)
    expect(input.settings.sync.url).toBe('https://nas.example:5006/rmoney-sync')
    expect(input.deletions).toHaveLength(1)
    expect(input.settings.aiConnection.apiKey).toBe('sk-ant-secret-value')
  })
})

describe('redactExportData — the sync path must keep sync data', () => {
  // Regression guard: folding the file-export strip into redactExportData would
  // break device sync in two ways that no UI surfaces.
  it('keeps settings.sync so a second device learns the folder config', () => {
    const out = redactExportData(payload())
    expect(out.settings.sync).toEqual({
      url: 'https://nas.example:5006/rmoney-sync',
      username: 'rmoney-sync',
      webdavPasswordSet: true,
      enabled: true,
    })
  })

  it('keeps deletions so tombstones propagate and records stay deleted', () => {
    const out = redactExportData(payload())
    expect(out.deletions).toHaveLength(1)
    expect(out.deletions[0].id).toBe('txn-9')
  })

  it('still redacts credentials', () => {
    const out = redactExportData(payload())
    expect(out.settings.aiConnection.apiKey).toBe('[REDACTED]')
    expect(out._redacted).toBe(true)
  })
})

describe('importing a file export with the sync fields stripped', () => {
  beforeEach(() => seedStorage({}))
  afterEach(resetStorage)

  it('defaults sync config and deletions instead of failing', () => {
    importAppData(redactForFileExport(payload()))
    // settings.sync absent → getSyncConfig falls back to the unconfigured shape,
    // so the recipient's app opens with Device Sync simply switched off.
    expect(getSyncConfig()).toEqual({
      url: '', username: '', webdavPasswordSet: false, enabled: false,
    })
  })
})
