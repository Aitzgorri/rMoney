import { useState } from 'react'
import { openVault, deleteVaultFile } from '../utils/secrets'
import styles from './PassphraseModal.module.css'
import { getMarketDataProviders, setMarketDataProviders, getAiConnection, setAiConnection } from '../data/settings'

const MAX_ATTEMPTS = 3

export default function PassphraseUnlock({ onDone, onReset }) {
  const [passphrase, setPassphrase] = useState('')
  const [showPass,   setShowPass]   = useState(false)
  const [error,      setError]      = useState('')
  const [busy,       setBusy]       = useState(false)
  const [attempts,   setAttempts]   = useState(0)
  const [forgotMode, setForgotMode] = useState(false)
  const [resetBusy,  setResetBusy]  = useState(false)

  const attemptsLeft = MAX_ATTEMPTS - attempts

  async function handleUnlock() {
    if (!passphrase) return
    setBusy(true)
    setError('')
    try {
      await openVault(passphrase)
      onDone()
    } catch {
      const next = attempts + 1
      setAttempts(next)
      setPassphrase('')
      if (next >= MAX_ATTEMPTS) {
        setError('Too many failed attempts. Close the app and try again, or reset your vault.')
      } else {
        setError(`Incorrect passphrase. ${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next === 1 ? '' : 's'} remaining.`)
      }
      setBusy(false)
    }
  }

  async function handleReset() {
    setResetBusy(true)
    // Clear apiKeySet flags in localStorage so next setup starts clean
    const providers = getMarketDataProviders()
    const cleaned = {}
    for (const [id, cfg] of Object.entries(providers)) {
      cleaned[id] = { ...cfg, apiKeySet: false }
    }
    setMarketDataProviders(cleaned)

    const ai = getAiConnection()
    if (ai) setAiConnection({ ...ai, apiKeySet: false })

    await deleteVaultFile()
    setResetBusy(false)
    onReset()
  }

  if (forgotMode) {
    return (
      <div className={styles.backdrop}>
        <div className={styles.modal}>
          <h2 className={styles.title}>Reset vault</h2>
          <p className={styles.description}>
            Resetting the vault <strong>permanently deletes</strong> all stored API keys.
            You will need to re-enter them in Settings after setting a new passphrase.
          </p>
          <p className={styles.warning}>This cannot be undone.</p>
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={() => setForgotMode(false)} disabled={resetBusy}>
              Go back
            </button>
            <button className={styles.dangerBtn} onClick={handleReset} disabled={resetBusy}>
              {resetBusy ? 'Resetting…' : 'Reset vault and lose all keys'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Unlock rMoney</h2>
        <p className={styles.description}>
          Enter your vault passphrase to decrypt your stored API keys.
        </p>

        <div className={styles.field}>
          <label className={styles.label}>Passphrase</label>
          <div className={styles.inputRow}>
            <input
              className={styles.input}
              type={showPass ? 'text' : 'password'}
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && attemptsLeft > 0) handleUnlock() }}
              disabled={busy || attemptsLeft <= 0}
              autoFocus
              autoComplete="current-password"
              placeholder="Enter your passphrase"
            />
            <button className={styles.toggleBtn} onClick={() => setShowPass(v => !v)}>
              {showPass ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button
            className={styles.primaryBtn}
            onClick={handleUnlock}
            disabled={busy || !passphrase || attemptsLeft <= 0}
          >
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>

        <button className={styles.forgotLink} onClick={() => setForgotMode(true)}>
          Forgot passphrase?
        </button>
      </div>
    </div>
  )
}
