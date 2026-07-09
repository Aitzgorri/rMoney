import { useState } from 'react'
import { verifyPassphrase } from '../utils/secrets'
import styles from './PassphraseModal.module.css'

// Prompts the user for the master passphrase before a Full Backup. The verified
// passphrase is not returned (the caller doesn't need it — vault bytes are
// readable once verification succeeds). Cancel returns the user to the save
// dialog without producing a file.
export default function FullBackupPassphrasePrompt({ onConfirm, onCancel }) {
  const [passphrase, setPassphrase] = useState('')
  const [showPass,   setShowPass]   = useState(false)
  const [busy,       setBusy]       = useState(false)
  const [error,      setError]      = useState('')

  async function handleConfirm() {
    if (!passphrase || busy) return
    setBusy(true)
    setError('')
    const ok = await verifyPassphrase(passphrase)
    if (ok) {
      onConfirm()
    } else {
      setError('Incorrect passphrase.')
      setPassphrase('')
      setBusy(false)
    }
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Confirm Full Backup</h2>
        <p className={styles.description}>
          A Full Backup includes your encrypted vault (API keys, OAuth tokens).
          Enter your master passphrase to confirm.
        </p>

        <div className={styles.field}>
          <label className={styles.label}>Master passphrase</label>
          <div className={styles.inputRow}>
            <input
              className={styles.input}
              type={showPass ? 'text' : 'password'}
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
              disabled={busy}
              autoFocus
              autoComplete="current-password"
              placeholder="Enter your passphrase"
            />
            <button type="button" className={styles.toggleBtn} onClick={() => setShowPass(v => !v)} title={showPass ? 'Hide the passphrase' : 'Show the passphrase while typing'}>
              {showPass ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel} disabled={busy} title="Cancel the full backup">
            Cancel
          </button>
          <button
            className={styles.primaryBtn}
            onClick={handleConfirm}
            disabled={busy || !passphrase}
            title="Verify the passphrase and create the full backup (includes the encrypted vault)"
          >
            {busy ? 'Verifying…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
