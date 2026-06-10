import { useState } from 'react'
import { openVault, migrateKeysToVault } from '../utils/secrets'
import styles from './PassphraseModal.module.css'

export default function PassphraseSetup({ onDone }) {
  const [passphrase,    setPassphrase]    = useState('')
  const [confirmation,  setConfirmation]  = useState('')
  const [showPass,      setShowPass]      = useState(false)
  const [error,         setError]         = useState('')
  const [busy,          setBusy]          = useState(false)

  async function handleCreate() {
    if (passphrase.length < 12) {
      setError('Passphrase must be at least 12 characters.')
      return
    }
    if (passphrase !== confirmation) {
      setError('Passphrases do not match.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await openVault(passphrase)
      await migrateKeysToVault()
    } catch (err) {
      setError('Could not create vault: ' + err.message)
      setBusy(false)
      return
    }
    // Vault created — hand off (in 'app' mode onDone migrates existing data into
    // the encrypted snapshot before the app renders).
    await onDone()
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Create your vault</h2>
        <p className={styles.description}>
          rMoney encrypts your API keys in a local vault. Choose a strong passphrase —
          you will need it every time you open the app.
        </p>
        <p className={styles.warning}>
          If you forget this passphrase, your stored API keys will be lost and cannot be recovered.
        </p>

        <div className={styles.field}>
          <label className={styles.label}>Passphrase (min. 12 characters)</label>
          <div className={styles.inputRow}>
            <input
              className={styles.input}
              type={showPass ? 'text' : 'password'}
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              autoFocus
              autoComplete="new-password"
              placeholder="Enter a strong passphrase"
            />
            <button className={styles.toggleBtn} onClick={() => setShowPass(v => !v)}>
              {showPass ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Confirm passphrase</label>
          <input
            className={styles.input}
            type={showPass ? 'text' : 'password'}
            value={confirmation}
            onChange={e => setConfirmation(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            autoComplete="new-password"
            placeholder="Re-enter passphrase"
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={handleCreate} disabled={busy}>
            {busy ? 'Creating vault…' : 'Create vault'}
          </button>
        </div>

        <p className={styles.hint}>
          Strength tip: use a phrase of 4+ random words (e.g. "correct horse battery staple").
        </p>
      </div>
    </div>
  )
}
