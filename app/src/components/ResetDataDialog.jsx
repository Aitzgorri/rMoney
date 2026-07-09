import { useState } from 'react'
import { resetAppData } from '../data/resetData'
import styles from './ResetDataDialog.module.css'

// All-OFF default — the user must explicitly tick anything they want carried over.
const DEFAULT_PRESERVE = {
  marketDataKeys: false,
  aiKey:          false,
  envelopes:      false,
  categories:     false,
  taxSetup:       false,
  tradingFees:    false,
  csvTemplates:   false,
  stockInventory: false,
}

const TOGGLE_LABELS = [
  ['marketDataKeys', 'Market Data API keys',  'Provider URLs, enabled flags, and stored API keys.'],
  ['aiKey',          'AI API key',             'AI endpoint URL, model, and stored API key.'],
  ['envelopes',      'Envelopes structure',    'Envelope names + hierarchy. All transfers and balances reset.'],
  ['categories',     'Categories structure',   'Category names, types, and hierarchy. Budgets reset.'],
  ['taxSetup',       'Tax setup',              'Default dividend tax %, per-country map, estimation rules.'],
  ['tradingFees',    'Trading fees',           'Per-exchange and per-stock fee schedules.'],
  ['csvTemplates',   'CSV import templates',   'Saved column mappings used during CSV import.'],
  ['stockInventory', 'Stock inventory',        'Stock profiles (ticker → name, exchange) and manual prices.'],
]

const CONFIRM_TOKEN = 'RESET'

export default function ResetDataDialog({ onBackup, onClose }) {
  const [preserve,    setPreserve]    = useState(DEFAULT_PRESERVE)
  const [confirmText, setConfirmText] = useState('')
  const [running,     setRunning]     = useState(false)
  const [error,       setError]       = useState(null)

  const canReset = confirmText === CONFIRM_TOKEN && !running

  function toggle(key) {
    setPreserve(p => ({ ...p, [key]: !p[key] }))
  }

  async function handleReset() {
    setRunning(true)
    setError(null)
    try {
      await resetAppData(preserve)
      // Reload so the app re-mounts from the cleaned state.
      window.location.reload()
    } catch (err) {
      setError(err?.message ?? 'Reset failed.')
      setRunning(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={running ? undefined : onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Reset data</h3>
          {!running && <button className={styles.close} onClick={onClose} title="Close without resetting">✕</button>}
        </div>

        <div className={styles.warning}>
          <strong>This permanently deletes every record in this app.</strong>
          <span>Action cannot be undone. Save a backup first if you might want it back.</span>
        </div>

        <div className={styles.backupRow}>
          <button type="button" className={styles.backupBtn} onClick={onBackup} disabled={running} title="Open Save → Full backup before resetting">
            Back up first…
          </button>
          <span className={styles.backupHint}>Opens Save → Full backup (includes API keys).</span>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Keep the following from the current data:</div>
          <div className={styles.toggleList}>
            {TOGGLE_LABELS.map(([id, label, hint]) => (
              <label key={id} className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={preserve[id]}
                  onChange={() => toggle(id)}
                  disabled={running}
                />
                <span className={styles.toggleLabel}>{label}</span>
                <span className={styles.toggleHint}>{hint}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            Type <code className={styles.token}>RESET</code> below to enable the Reset button:
          </div>
          <input
            className={styles.confirmInput}
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="RESET"
            disabled={running}
            autoFocus
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={running} title="Close without resetting">
            Cancel
          </button>
          <button
            type="button"
            className={styles.resetBtn}
            onClick={handleReset}
            disabled={!canReset}
            title="Permanently delete all app data except the ticked items (cannot be undone)"
          >
            {running ? 'Resetting…' : 'Reset'}
          </button>
        </div>
      </div>
    </div>
  )
}
