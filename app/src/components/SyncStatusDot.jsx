import { useState, useEffect } from 'react'
import { getSyncStatus, subscribeSyncStatus, syncNow } from '../utils/sync'
import styles from './SyncStatusDot.module.css'

// Global device-sync indicator (SPEC-039, Phase 59c). Rendered once by App as a
// fixed corner dot on every screen; hidden entirely until sync is configured.
export default function SyncStatusDot() {
  const [s, setS] = useState(() => getSyncStatus())
  useEffect(() => subscribeSyncStatus(setS), [])
  if (!s.configured) return null

  const kind = s.status === 'syncing' ? 'syncing'
    : (s.status === 'unreachable' || s.status === 'error') ? 'trouble'
    : s.dirty ? 'pending' : 'ok'
  const glyph = { syncing: '↻', trouble: '⚠', pending: '●', ok: '✓' }[kind]
  const title = {
    syncing:  'Syncing…',
    trouble:  `Sync ${s.status}${s.lastError ? ` — ${s.lastError}` : ' — will retry on the next change or focus'} (click to retry now)`,
    pending:  'Unsynced changes — click to sync now',
    ok:       `Synced${s.lastSyncAt ? ` — last ${new Date(s.lastSyncAt).toLocaleString()}` : ''} (click to sync again)`,
  }[kind]

  return (
    <button className={`${styles.dot} ${styles[kind]}`} onClick={() => syncNow()} title={title}>
      {glyph}
    </button>
  )
}
